const express = require("express");
const multer = require("multer");
const path = require("path");
const port = 3000;
const bodyParser = require("body-parser");
const mysql = require('mysql2');  // Changed from sqlite3 to mysql2
const session = require('express-session');
const { log, error } = require("console");

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const newFileName = "order" + "-" + uniqueSuffix + ext;

        cb(null, newFileName);
    },
});

const upload = multer({ storage: storage });

// Connect to MySQL database instead of SQLite
let db = mysql.createConnection({
    host: "10.30.6.62",
    port: "3306",
    user: "t4e",
    password: "T4e_66070093",
    database: "pizzeria"
});

// Connect to the database
db.connect((err) => {
    if (err) {
        return console.error('Error connecting to database:', err.message);
    }
    console.log('Connected to the Pizzeria database.');
});

// Creating the Express server
const app = express();

// Session setup
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true,
    cookie: {
        expires: 7200000
    }
}));

app.use(express.json());

app.use(bodyParser.urlencoded({ extended: true }));
// static resources & template engine
app.use(express.static("views"));

// Set EJS as templating engine
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.redirect('home');
});

app.get("/home", (req, res) => {
    res.render('home', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
});

app.get("/choose", (req, res) => {
    if (req.session.loggedin) {
        res.render('choose', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
    } else {
        res.redirect('/home?nli=true');
    }
});

app.post("/complete_order", upload.single("file"), async (req, res) => {
    // if (!req.file) {
    //   return res.status(400).json({ message: "No file uploaded" });
    // }

    try {
        // Changed SQLite IS to MySQL =
        const pizza_ingredients_amount_query =
  `SELECT pizza_ingredients.ingredient_id, SUM(quantity * quantity_required) as \`require\`, stock_quantity FROM orders
  JOIN order_items
  USING (order_id)
  JOIN pizza_ingredients
  ON (item_id = pizza_id)
  JOIN ingredients
  ON (pizza_ingredients.ingredient_id = ingredients.ingredient_id)
  WHERE order_status = "pending" AND orders.user_id = ? AND item_type = "pizza" AND pizza_ingredients.ingredient_id > 20 AND pizza_ingredients.ingredient_id != 25
  GROUP BY pizza_ingredients.ingredient_id
  ORDER BY pizza_ingredients.ingredient_id`;

        const etc_amount_query =
            `SELECT etc_id, quantity, stock_quantity FROM orders\
      JOIN order_items\
      USING (order_id)\
      JOIN etc\
      ON (item_id = etc_id)\
      WHERE order_status = "pending" AND orders.user_id = ? AND item_type = "etc"\
      ORDER BY etc_id`;

        // MySQL requires promises to be handled differently
        const ingredient_decrease_material = await new Promise((resolve, reject) => {
            db.query(pizza_ingredients_amount_query, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
        });

        const etc_decrease_material = await new Promise((resolve, reject) => {
            db.query(etc_amount_query, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
        });

        // For MySQL, we'll use a transaction for multiple operations
        let decrease_queries = [];

        for (var i = 0; i < ingredient_decrease_material.length; i++) {
            let new_ing_quan = Math.max(ingredient_decrease_material[i].stock_quantity - ingredient_decrease_material[i].require, 0);
            decrease_queries.push({
                sql: `UPDATE ingredients SET stock_quantity = ? WHERE ingredient_id = ?`,
                values: [new_ing_quan, ingredient_decrease_material[i].ingredient_id]
            });
        }

        for (var i = 0; i < etc_decrease_material.length; i++) {
            let new_etc_quan = Math.max(etc_decrease_material[i].stock_quantity - etc_decrease_material[i].quantity, 0);
            decrease_queries.push({
                sql: `UPDATE etc SET stock_quantity = ? WHERE etc_id = ?`,
                values: [new_etc_quan, etc_decrease_material[i].etc_id]
            });
        }

        // Execute all queries in sequence
        for (const query of decrease_queries) {
            await new Promise((resolve, reject) => {
                db.query(query.sql, query.values, (error) => (error ? reject(error) : resolve()));
            });
        }

        let payment_proof = "/uploads/" + req.file.filename;

        const complete_query =
            `UPDATE orders\
      SET payment_proof = ?, order_status = "preparing"\
      WHERE order_status = "pending" AND user_id = ?`;

        await new Promise((resolve, reject) => {
            db.query(complete_query, [payment_proof, req.session.user_id], (error) => (error ? reject(error) : resolve()));
        });

    } catch (error) {
        console.error(error);
    }

    res.json({
        message: "File uploaded.",
        filename: req.file.filename,
        path: "/uploads/" + req.file.filename,
        redirect: '/tracking'
    });
});

app.get("/category", async (req, res) => {
    let sql = "";
    let etc_query = "";
    if (req.session.loggedin) {
        // Changed IS to = and quoting syntax
        sql =
    `SELECT pizza_id, pizza_name, price FROM pizzas
    LEFT JOIN (SELECT pizza_id, ingredient_id, SUM(quantity_required) AS \`require\`, stock_quantity FROM pizza_ingredients
    JOIN ingredients USING (ingredient_id)
    WHERE ingredient_id >= 21
    GROUP BY pizza_id, ingredient_id
    HAVING \`require\` > stock_quantity
    ) AS stock_check USING (pizza_id)
    LEFT JOIN (SELECT item_id FROM orders
    JOIN order_items USING (order_id)
    WHERE item_type = "pizza" AND user_id = ? AND order_status = "pending"
    ) AS pending_items ON item_id = pizza_id
    WHERE ingredient_id is NULL AND (user_id = ? OR user_id = 1) AND item_id IS NULL
    ORDER BY user_id`;

        etc_query =
            `SELECT * FROM etc\
    LEFT JOIN (SELECT item_id FROM orders\
    JOIN order_items USING (order_id)\
    WHERE order_status = "pending" AND item_type = "etc" AND user_id = ?)\
    ON item_id = etc_id\
    WHERE stock_quantity > 0 AND item_id IS NULL`;
    } else {
        sql =
    `SELECT pizza_id, pizza_name, price FROM pizzas
    LEFT JOIN (SELECT pizza_id, ingredient_id, SUM(quantity_required) AS \`require\`, stock_quantity FROM pizza_ingredients
    JOIN ingredients USING (ingredient_id)
    WHERE ingredient_id >= 21
    GROUP BY pizza_id, ingredient_id
    HAVING \`require\` > stock_quantity
    ) AS stock_check USING (pizza_id)
    LEFT JOIN (SELECT item_id FROM orders
    JOIN order_items USING (order_id)
    WHERE item_type = "pizza" AND user_id = "1" AND order_status = "pending"
    ) AS pending_items ON item_id = pizza_id
    WHERE ingredient_id is NULL AND user_id = 1 AND item_id IS NULL
    ORDER BY user_id`;

        etc_query = "SELECT * FROM etc WHERE stock_quantity > 0";
    }

    let ingredient_query = `SELECT ingredient_id, ingredient_name, stock_quantity, thai_name FROM ingredients\
                          WHERE ingredient_name NOT LIKE "%\\_%" ESCAPE "\\" AND stock_quantity > 0;`;
    let pizza_results = "";
    let etc_results = "";
    let ingredient_results = "";
    try {
        pizza_results = await new Promise((resolve, reject) => {
            if (req.session.loggedin) {
                db.query(sql, [req.session.user_id, req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
            } else {
                db.query(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
            }
        });

        etc_results = await new Promise((resolve, reject) => {
            if (req.session.loggedin) {
                db.query(etc_query, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
            } else {
                db.query(etc_query, (error, rows) => (error ? reject(error) : resolve(rows)));
            }
        });

        ingredient_results = await new Promise((resolve, reject) => {
            db.query(ingredient_query, (error, rows) => (error ? reject(error) : resolve(rows)));
        });

        res.render('category', {
            loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "",
            pizza_item: pizza_results, etc_item: etc_results, ingredient_item: ingredient_results
        });

    } catch (error) {
        console.error(error.message);
        res.render('category', {
            loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "",
            pizza_item: [], etc_item: [], ingredient_item: []
        });
    }
});

app.get("/pizza-:pizza_id", (req, res) => {
    const pizza_id = req.params.pizza_id;
    const sql = `SELECT pizza_id, pizza_name, thai_name, price FROM pizzas\
              JOIN pizza_ingredients USING (pizza_id)\
              JOIN ingredients USING (ingredient_id)\
              WHERE pizza_id = ?\
              ORDER BY ingredient_id;`;

    db.query(sql, [pizza_id], (error, results) => {
        if (error) {
            console.log(error.message);
            res.render('pizza-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: [{ pizza_name: 'เจ๊ง', ingredient_name: 'เจ๊ง' }] });
        } else {
            res.render('pizza-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: results });
        }
    });
});

app.get("/etc-:etc_id", (req, res) => {
    const etc_id = req.params.etc_id;
    const sql = `SELECT * FROM etc\
               WHERE etc_id = ?`;

    db.query(sql, [etc_id], (error, results) => {
        if (error) {
            console.log(error.message);
            res.render('etc-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: [{ etc_name: 'เจ๊ง', price: 'เจ๊ง' }] });
        } else {
            res.render('etc-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: results });
        }
    });
});

app.post("/authen", async (req, res) => {
    const { username, password } = req.body;
    const sql = `SELECT * FROM users WHERE (username = ? OR user_email = ?) AND user_password = ?`;

    db.query(sql, [username, username, password], (error, results) => {
        if (error) {
            console.log(error.message);
        }
        if (results.length > 0) {
            req.session.loggedin = true;
            req.session.username = results[0].username;
            req.session.user_id = results[0].user_id;
            req.session.user_privilege = results[0].user_privilege;
            console.log("logged in!");
            return res.json({ success: true, redirect: '/home' });
        } else {
            return res.json({ success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
        }
    });
});

app.post("/newuser", async (req, res) => {
    const { username, email, password } = req.body;
    const sql = `SELECT * FROM users WHERE username = ? OR user_email = ?;`;

    db.query(sql, [username, email], (error, results) => {
        if (error) {
            console.log(error.message);
        }
        if (results.length > 0) {
            return res.json({ success: false, message: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว" });
        } else {
            try {
                const insert_sql = `INSERT INTO users (username, user_email, user_password, user_privilege)\
                            VALUES (?, ?, ?, "customer");`;

                db.query(insert_sql, [username, email, password], (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({ success: false, message: "เกิดข้อผิดพลาดในการสร้างผู้ใช้" });
                    }
                    console.log("User created!");
                    return res.json({ success: true, redirect: '/home' });
                });
            } catch (error) {
                console.log(error);
                return res.json({ success: false, message: "เกิดข้อผิดพลาดในการสร้างผู้ใช้" });
            }
        }
    });
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    console.log("logged out!");
    res.redirect('/home');
});

app.get("/orderform", (req, res) => {
    if (req.session.loggedin) {
        res.render('orderform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
    } else {
        res.redirect('/home?nli=true');
    }
});

app.get("/createform", (req, res) => {
    if (req.session.loggedin) {
        res.render('createform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
    } else {
        res.redirect('/home?nli=true');
    }
});

app.post("/create", async (req, res) => {
    const { pizza_name, dough, size, sauce, topping } = req.body;
    const price = price_calc(dough, size, topping);
    const sql = `INSERT INTO pizzas (pizza_name, price, user_id) VALUES (?, ?, ?)`;

    db.query(sql, [pizza_name, price, req.session.user_id], (error, results) => {
        if (error) {
            console.log(error.message);
        } else {
            console.log("Pizza Created!");

            // Call topping_adder after successful pizza creation
            topping_adder(`${dough}_${size}`, pizza_name);
            topping_adder(sauce, pizza_name);
            if (typeof (topping) == "string") {
                topping_adder(topping, pizza_name);
            } else {
                topping.forEach((item) => {
                    topping_adder(item, pizza_name);
                });
            }

            res.redirect("/category");
        }
    });
});

app.use('/uploads', express.static('uploads'));

app.get("/orderlist", async (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/home?nli=true');
    }

    const sql = `SELECT order_id, item_id, item_type, quantity FROM orders JOIN order_items USING (order_id) WHERE user_id = ? AND order_status = "pending";`;

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(sql, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
        });

        const menu_order = await Promise.all(results.map(async (item) => {
            if (item.item_type === 'pizza') {
                const select_sql = `SELECT pizza_name, GROUP_CONCAT(thai_name ORDER BY ingredient_id SEPARATOR ', ') AS thai_name, price, pizza_id\
                              FROM pizzas\
                              JOIN pizza_ingredients USING (pizza_id)\
                              JOIN ingredients USING (ingredient_id)\
                              WHERE pizza_id = ?\
                              GROUP BY pizza_id;`;

                const pizza = await new Promise((resolve, reject) => {
                    db.query(select_sql, [item.item_id], (error, rows) => (error ? reject(error) : resolve(rows)));
                });
                if (pizza.length > 0) {
                    pizza[0].order_id = item.order_id;
                    pizza[0].quantity = item.quantity;
                    pizza[0].type = item.item_type;
                    return pizza[0];
                }
                return null;
            } else if (item.item_type === 'etc') {
                const select_sql = `SELECT etc_name, price, etc_id\
                              FROM etc\
                              WHERE etc_id = ?;`;

                const pizza = await new Promise((resolve, reject) => {
                    db.query(select_sql, [item.item_id], (error, rows) => (error ? reject(error) : resolve(rows)));
                });
                if (pizza.length > 0) {
                    pizza[0].order_id = item.order_id;
                    pizza[0].quantity = item.quantity;
                    pizza[0].type = item.item_type;
                    return pizza[0];
                }
                return null;
            }
        }));

        res.render('orderlist', {
            loggedin: req.session.loggedin,
            username: req.session.username || "",
            user_privilege: req.session.user_privilege || "",
            menu: menu_order.filter(Boolean)
        });

    } catch (error) {
        console.error(error.message);
        res.render('orderlist', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", menu: [] });
    }
});

app.get("/tracking", async (req, res) => {
    if (req.session.loggedin) {
        let order_results = "";
        try {
            let order_query =
                `SELECT order_id, total_price, order_status, receiver_name, house_no, village_no, street, sub_district, district, province, postal_code, country FROM orders\
          JOIN user_address\
          USING (user_id)\
          WHERE user_id = ? AND order_status != "pending"\
          ORDER BY order_id DESC`;

            order_results = await new Promise((resolve, reject) => {
                db.query(order_query, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
            });

        } catch (error) {
            console.log(error);
            res.redirect('404');
        }
        res.render('tracking', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", order: order_results });
    } else {
        res.redirect('/home?nli=true');
    }
});

app.get("/tracking_seller", async (req, res) => {
    if (req.session.loggedin && (req.session.user_privilege == "admin" || req.session.user_privilege == "employee")) {
        let order_results = "";
        try {
            let order_query =
                `SELECT order_id, user_id, total_price, order_status, payment_proof, receiver_name, house_no, village_no, street, sub_district, district, province, postal_code, country FROM orders\
          JOIN user_address\
          USING (user_id)\
          WHERE order_status != "pending"\
          ORDER BY order_id DESC`;

            order_results = await new Promise((resolve, reject) => {
                db.query(order_query, (error, rows) => (error ? reject(error) : resolve(rows)));
            });

        } catch (error) {
            console.log(error);
            res.redirect('404');
        }
        res.render('tracking_seller', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", allder: order_results });
    } else {
        res.redirect('/home?nli=true');
    }
});

app.get("/customerinfo", async (req, res) => {
    if (req.session.loggedin) {
        const sql = `SELECT * FROM user_address WHERE user_id = ?;`;

        let pizza_query =
            `SELECT quantity, pizza_name, order_id, address_id, item_type, item_id, price_per_unit, (price_per_unit * quantity) AS total FROM orders\
      JOIN order_items\
      USING (order_id)\
      JOIN pizzas\
      ON item_id = pizza_id \
      WHERE order_status = "pending" AND orders.user_id = ? AND item_type = "pizza"\
      ORDER BY pizza_id`;

        let etc_query =
            `SELECT quantity, etc_name, order_id, address_id, item_type, item_id, price_per_unit, (price_per_unit * quantity) AS total FROM orders\
      JOIN order_items\
      USING (order_id)\
      JOIN etc\
      ON item_id = etc_id \
      WHERE order_status = "pending" AND orders.user_id = ? AND item_type = "etc"\
      ORDER BY etc_id`;

        let sql_results = "";
        let pizza_results = "";
        let etc_results = "";

        try {
            sql_results = await new Promise((resolve, reject) => {
                db.query(sql, [req.session.user_id], (error, result) => (error ? reject(error) : resolve(result)));
            });

            pizza_results = await new Promise((resolve, reject) => {
                db.query(pizza_query, [req.session.user_id], (error, result) => (error ? reject(error) : resolve(result)));
            });

            etc_results = await new Promise((resolve, reject) => {
                db.query(etc_query, [req.session.user_id], (error, result) => (error ? reject(error) : resolve(result)));
            });

            let total_price = 0;
            for (var i = 0; i < pizza_results.length; i++) {
                total_price += pizza_results[i].total;
            }
            for (var i = 0; i < etc_results.length; i++) {
                total_price += etc_results[i].total;
            }

            if (sql_results.length > 0) {
                res.render('customerinfo', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", address: sql_results[0], tag: "disabled", pizza_item: pizza_results, etc_item: etc_results, grand_price: total_price });
            } else {
                res.render('customerinfo', {
                    loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", address: {
                        address_id: "",
                        user_id: "",
                        receiver_name: "",
                        phone_no: "",
                        house_no: "",
                        village_no: "",
                        street: "",
                        sub_district: "",
                        district: "",
                        province: "",
                        postal_code: "",
                    },
                    tag: "", pizza_item: pizza_results, etc_item: etc_results, grand_price: total_price
                });
            }
        } catch (error) {
            console.error(error.message);
            res.redirect('404');
        }

    } else {
        res.redirect('/home?nli=true');
    }
});

app.post("/new_address", async (req, res) => {
    const { receiver_name,
        phone_no,
        house_no,
        village_no,
        street,
        sub_district,
        district,
        province,
        postal_code,
        tag,
        grand_price } = req.body;
    try {
        if (tag != "disabled") {
            const sql = `INSERT INTO user_address (user_id, receiver_name,\
      phone_no,\
      house_no,\
      village_no,\
      street,\
      sub_district,\
      district,\
      province,\
      postal_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            await new Promise((resolve, reject) => {
                db.query(sql, [
                    req.session.user_id,
                    receiver_name,
                    phone_no,
                    house_no,
                    village_no,
                    street,
                    sub_district,
                    district,
                    province,
                    postal_code
                ], (error) => (error ? reject(error) : resolve()));
            });
            console.log("Address added!");
        }

        const testql = await new Promise((resolve, reject) => {
            db.query(`SELECT address_id FROM user_address WHERE user_id = ?`, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
        });

        const update_query =
            `UPDATE orders\
      SET total_price = ?, address_id = ?\
      WHERE order_status = "pending" AND user_id = ?`;

        await new Promise((resolve, reject) => {
            db.query(update_query, [grand_price, testql[0].address_id, req.session.user_id], (error) => (error ? reject(error) : resolve()));
        });

        res.redirect("/qrpayment");
    } catch (error) {
        console.log(error);
        res.redirect('404');
    }
});

app.get("/qrpayment", async (req, res) => {
    if (req.session.loggedin) {
        let order_query =
            `SELECT order_id, total_price FROM orders\
      WHERE order_status = "pending" AND user_id = ?`;

        try {
            order_results = await new Promise((resolve, reject) => {
                db.query(order_query, [req.session.user_id], (error, rows) => (error ? reject(error) : resolve(rows)));
            });

            res.render('qrpayment', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", order_id: order_results[0].order_id, total_price: order_results[0].total_price });
        } catch (error) {
            console.log(error);
            res.redirect('404');
        }
    } else {
        res.redirect('/home?nli=true');
    }
});

// Updated ingredients seller route to fetch all necessary data including 2 tables (etc and ingredient)
app.get("/ingredients_seller", (req, res) => {
    if (req.session.user_privilege == "admin" || req.session.user_privilege == "employee") {
        // Get ingredients data
        const ingredientSql = `SELECT ingredient_id, ingredient_name, stock_quantity, thai_name, unit FROM ingredients\
                  WHERE ingredient_name NOT LIKE "%\\_%" ESCAPE "\\";`;

        // Get etc data
        const etcSql = `SELECT etc_id, etc_name, stock_quantity, price FROM etc;`;

        // Get ingredients data
        db.query(ingredientSql, (ingredientError, ingredientResults) => {
            if (ingredientError) {
                console.log("Ingredient error:", ingredientError.message);
                ingredientResults = [];
            }

            // Get etc data
            db.query(etcSql, (etcError, etcResults) => {
                if (etcError) {
                    console.log("Etc error:", etcError.message);
                    etcResults = [];
                }

                // Render the page with both data sets
                res.render('ingredients_seller', {
                    loggedin: req.session.loggedin,
                    username: req.session.username || "",
                    user_privilege: req.session.user_privilege || "",
                    ingredient: ingredientResults,
                    etc: etcResults
                });
            });
        });
    } else {
        res.redirect("/home?nli=true");
    }
});

// Enhanced route to handle inventory updates for both ingredients and etc tables
app.post("/update-stock", (req, res) => {
    if (req.session.user_privilege !== "admin" && req.session.user_privilege !== "employee") {
        return res.status(403).send("Access denied");
    }

    const { ingredient_id, etc_id, quantity, operation, current_stock } = req.body;
    const isEtcItem = etc_id ? true : false;

    // Input validation
    if ((!ingredient_id && !etc_id) || !quantity || !operation) {
        return res.status(400).send("Missing required parameters");
    }

    // Convert quantity to number
    const changeAmount = parseInt(quantity);
    if (isNaN(changeAmount) || changeAmount <= 0) {
        return res.status(400).send("Invalid quantity");
    }

    // Set up the appropriate SQL and parameters based on item type
    const itemId = isEtcItem ? etc_id : ingredient_id;
    const tableName = isEtcItem ? 'etc' : 'ingredients';
    const idColumn = isEtcItem ? 'etc_id' : 'ingredient_id';

    // Get current stock from database to ensure we have the latest value
    const checkSql = `SELECT stock_quantity FROM ${tableName} WHERE ${idColumn} = ?`;

    db.query(checkSql, [itemId], (error, results) => {
        if (error) {
            console.error("Database error:", error.message);
            return res.status(500).send("Database error");
        }

        if (!results || results.length === 0) {
            return res.status(404).send("Item not found");
        }

        let currentStock = results[0].stock_quantity;
        let newStock;

        if (operation === "increase") {
            newStock = currentStock + changeAmount;
        } else if (operation === "decrease") {
            if (currentStock < changeAmount) {
                return res.status(400).send("ไม่สามารถลดจำนวนได้ เนื่องจากสินค้าในคลังไม่เพียงพอ");
            }
            newStock = currentStock - changeAmount;
        } else {
            return res.status(400).send("Invalid operation");
        }

        // Update stock in database
        const updateSql = `UPDATE ${tableName} SET stock_quantity = ? WHERE ${idColumn} = ?`;

        db.query(updateSql, [newStock, itemId], (error, results) => {
            if (error) {
                console.error("Update error:", error.message);
                return res.status(500).send("Update failed");
            }

            console.log(`Stock updated: ${tableName} #${itemId} ${operation}d by ${changeAmount}. New stock: ${newStock}`);

            // Redirect with a query parameter to indicate which tab should be active
            const tabToShow = isEtcItem ? 'etc' : 'ingredient';
            res.redirect(`/ingredients_seller?tab=${tabToShow}`);
        });
    });
});

// ... rest of the routes ...

app.listen(port, () => {
    console.log(`This Web Server is running on port ${port}`);
});

// Helper functions
let price_calc = (dough, size, topping) => {
    var dough_spec = 1;
    var size_spec = 1;

    if (dough == "cheese_crust" || dough == "sausage_crust") {
        var dough_spec = 1.3;
    }

    if (size == "M") {
        var size_spec = 1.4;
    } else if (size == "L") {
        var size_spec = 1.8;
    } else if (size == "XL") {
        var size_spec = 2.2;
    }

    if (typeof (topping) == "string") {
        var price = Math.floor((150 * dough_spec) + (100 * size_spec) + (49));
    } else {
        var price = Math.floor((150 * dough_spec) + (100 * size_spec) + (Math.max(topping.length - 2, 1) * 49));
    }

    return price;
};

let topping_adder = (topping, pizza_name) => {
    var quantity = 50
    if (topping.search("sauce") != -1) {
        quantity = 250;
    } else if (topping.search("crust") != -1 || topping.search("original") != -1 || topping.search("crispy") != -1) {
        quantity = 1;
    }
    const sql2 = `INSERT INTO pizza_ingredients (pizza_id, ingredient_id, quantity_required)\
  SELECT \
      (SELECT pizza_id FROM pizzas WHERE pizza_name = ?) AS pizza_id,\
      (SELECT ingredient_id FROM ingredients WHERE ingredient_name = ?) AS ingredient_id,\
      ? AS quantity_required`;

    db.query(sql2, [pizza_name, topping, quantity], (error, results) => {
        if (error) {
            console.log(error.message);
        }
    });
};