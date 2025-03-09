const express = require("express");
const path = require("path");
const port = 3000;
const bodyParser = require("body-parser");
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const { log, error } = require("console");

// Connect to SQLite database
let db = new sqlite3.Database("data/pizzeria.db", (err) => {
  if (err) {
    return console.error(err.message);
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
  res.render('Landing');
});

app.get("/home", (req, res) => {
  res.render('home', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
});

app.get("/choose", (req, res) => {
  if (req.session.loggedin) {
    res.render('choose', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/category", async (req, res) => {
  let sql = "";
  let etc_query = "";
  if (req.session.loggedin) {
    sql = 
    `SELECT pizza_id, pizza_name, price FROM pizzas
    LEFT JOIN (SELECT pizza_id, ingredient_id, SUM(quantity_required) AS require, stock_quantity FROM pizza_ingredients
    JOIN ingredients USING (ingredient_id)
    WHERE ingredient_id >= 21
    GROUP BY pizza_id, ingredient_id
    HAVING require > stock_quantity
    ) USING (pizza_id)
    LEFT JOIN (SELECT item_id FROM orders
    JOIN order_items USING (order_id)
    WHERE item_type IS "pizza" AND user_id IS "${req.session.user_id}" AND order_status IS "pending")
    ON item_id = pizza_id
    WHERE ingredient_id is NULL AND (user_id = "${req.session.user_id}" OR user_id = 1) AND item_id IS NULL
    ORDER BY user_id`

    etc_query =
    `SELECT * FROM etc
    LEFT JOIN (SELECT item_id FROM orders
    JOIN order_items USING (order_id)
    WHERE item_type IS "etc" AND user_id IS "${req.session.user_id}")
    ON item_id = etc_id
    WHERE stock_quantity > 0 AND item_id IS NULL`
  } else {
    sql = 
    `SELECT pizza_id, pizza_name, price FROM pizzas
    LEFT JOIN (SELECT pizza_id, ingredient_id, SUM(quantity_required) AS require, stock_quantity FROM pizza_ingredients
    JOIN ingredients USING (ingredient_id)
    WHERE ingredient_id >= 21
    GROUP BY pizza_id, ingredient_id
    HAVING require > stock_quantity
    ) USING (pizza_id)
    LEFT JOIN (SELECT item_id FROM orders
    JOIN order_items USING (order_id)
    WHERE item_type IS "pizza" AND user_id IS "1" AND order_status IS "pending")
    ON item_id = pizza_id
    WHERE ingredient_id is NULL AND user_id = 1 AND item_id IS NULL
    ORDER BY user_id`

    etc_query = "SELECT * FROM etc WHERE stock_quantity > 0";
  }
  let ingredient_query = `SELECT ingredient_id, ingredient_name, stock_quantity, thai_name FROM ingredients
                          WHERE ingredient_name NOT LIKE "%\\_%" ESCAPE "\\" AND stock_quantity > 0;`
  let pizza_results = "";
  let etc_results = "";
  let ingredient_results = "";
  try {
    pizza_results = await new Promise((resolve, reject) => {
      db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
    })
    etc_results = await new Promise((resolve, reject) => {
      db.all(etc_query, (error, rows) => (error ? reject(error) : resolve(rows)));
    })

    ingredient_results = await new Promise((resolve, reject) => {
      db.all(ingredient_query, (error, rows) => (error ? reject(error) : resolve(rows)));
    })

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
              WHERE pizza_id = ${pizza_id}\
              ORDER BY ingredient_id;`;

  db.all(sql, (error, results) => {
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
  const sql = `SELECT * FROM etc
               WHERE etc_id = ${etc_id}`;

  db.all(sql, (error, results) => {
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
  const sql = `SELECT * FROM users WHERE (username = "${username}" OR user_email = "${username}") AND user_password = "${password}"`
  db.all(sql, (error, results) => {
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
  })
});

app.post("/newuser", async (req, res) => {
  const { username, email, password } = req.body;
  const sql = `SELECT * FROM users WHERE username = "${username}" OR user_email = "${email}";`
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
    }
    if (results.length > 0) {
      return res.json({ success: false, message: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว" });
    } else {
      try {
        const insert_sql = `INSERT INTO users (username, user_email, user_password, user_privilege)
                            VALUES ("${username}", "${email}", "${password}", "customer");`
        db.run(insert_sql);
      } catch (error) {
        console.log(error);
      }
      console.log("User created!");
      return res.json({ success: true, redirect: '/home' });
    }
  })
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
    res.redirect('/home');
  }
});

app.get("/createform", (req, res) => {
  if (req.session.loggedin) {
    res.render('createform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.post("/create", async (req, res) => {
  const { pizza_name, dough, size, sauce, topping } = req.body;
  const price = price_calc(dough, size, topping);
  const sql = `INSERT INTO pizzas (pizza_name, price, user_id) VALUES ("${pizza_name}", ${price}, ${req.session.user_id})`
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
    } else {
      console.log("Pizza Created!");
    }
  });

  topping_adder(`${dough}_${size}`, pizza_name);
  topping_adder(sauce, pizza_name);
  if (typeof (topping) == "string") {
    topping_adder(topping, pizza_name);
  } else {
    topping.forEach((item) => {
      topping_adder(item, pizza_name);
    });
  }

  // res.send({ pizza_data: { pizza_name: pizza_name, dough: dough, size: size, sauce: sauce, topping: topping } });
  res.redirect("/category");
});

app.get("/orderlist", async (req, res) => {
  if (!req.session.loggedin) {
    return res.redirect('/home');
  }

  const sql = `SELECT order_id, item_id, item_type, quantity FROM orders JOIN order_items USING (order_id) WHERE user_id = ${req.session.user_id} AND order_status = "pending";`;

  try {
    const results = await new Promise((resolve, reject) => {
      db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
    });
    

    const menu_order = await Promise.all(results.map(async (item) => {
      if (item.item_type === 'pizza') {
        const select_sql = `SELECT pizza_name, GROUP_CONCAT(thai_name, ', ' ORDER BY ingredient_id) AS thai_name, price, pizza_id
                            FROM pizzas
                            JOIN pizza_ingredients USING (pizza_id)
                            JOIN ingredients USING (ingredient_id)
                            WHERE pizza_id = ${item.item_id}
                            ORDER BY ingredient_id;`;

        const pizza = await new Promise((resolve, reject) => {
          db.all(select_sql, (error, rows) => (error ? reject(error) : resolve(rows)));
        });
        pizza[0].order_id = item.order_id;
        pizza[0].quantity = item.quantity;
        pizza[0].type = item.item_type;
        return pizza[0];
      } else if (item.item_type === 'etc') {
        const select_sql = `SELECT etc_name, price, etc_id
                            FROM etc
                            WHERE etc_id = ${item.item_id}
                            ORDER BY etc_id;`;

        const pizza = await new Promise((resolve, reject) => {
          db.all(select_sql, (error, rows) => (error ? reject(error) : resolve(rows)));
        });
        pizza[0].order_id = item.order_id;
        pizza[0].quantity = item.quantity;
        pizza[0].type = item.item_type;
        return pizza[0];
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


app.get("/tracking", (req, res) => {
  if (req.session.loggedin) {
    res.render('tracking', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/tracking_seller", (req, res) => {
  if (req.session.loggedin) {
    res.render('tracking_seller', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/customerinfo", (req, res) => {
  if (req.session.loggedin) {
    res.render('customerinfo', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/qrpayment", (req, res) => {
  if (req.session.loggedin) {
    res.render('qrpayment', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

// Updated ingredients seller route to fetch all necessary data including 2 tables (etc and ingredient)
app.get("/ingredients_seller", (req, res) => {
  if (req.session.user_privilege == "admin" || req.session.user_privilege == "employee") {
    // Get ingredients data
    const ingredientSql = `SELECT ingredient_id, ingredient_name, stock_quantity, thai_name, unit FROM ingredients
                WHERE ingredient_name NOT LIKE "%\\_%" ESCAPE "\\";`;

    // Get etc data
    const etcSql = `SELECT etc_id, etc_name, stock_quantity, price FROM etc;`;

    // Get ingredients data
    db.all(ingredientSql, (ingredientError, ingredientResults) => {
      if (ingredientError) {
        console.log("Ingredient error:", ingredientError.message);
        ingredientResults = [];
      }

      // Get etc data
      db.all(etcSql, (etcError, etcResults) => {
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
        // debug data
        // console.log(ingredientResults);
        // console.log(etcResults);

      });
    });
  } else {
    res.redirect("/home");
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

  db.get(checkSql, [itemId], (error, result) => {
    if (error) {
      console.error("Database error:", error.message);
      return res.status(500).send("Database error");
    }

    if (!result) {
      return res.status(404).send("Item not found");
    }

    let currentStock = result.stock_quantity;
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

    db.run(updateSql, [newStock, itemId], function (error) {
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

app.post("/remove_orderitem", async (req, res) => {
  const { order_id, item_id, type, value } = req.body;
  try {
    const remove = 
    `DELETE FROM order_items
     WHERE order_id IS "${order_id}" AND item_type IS "${type}" AND item_id IS "${item_id}";`
    db.run(remove);
    res.json({ message: "ส่งมาล้ะแต่", redirect: '/orderlist' });
  } catch (error) {
    res.json({ message: "ส่งมาล้ะแต่ Error", redirect: '/orderlist' });
  }
})

app.post("/update_orderitem", async (req, res) => {
  const { order_id, item_id, type, value } = req.body;
  try {
    const update = 
    `UPDATE order_items
     SET quantity = "${value}"
     WHERE order_id IS "${order_id}" AND item_type IS "${type}" AND item_id IS "${item_id}";`
    db.run(update);
    res.json({ message: "ส่งมาล้ะแต่" });
  } catch (error) {
    res.json({ message: "ส่งมาล้ะแต่ Error" });
  }
})

app.post("/addtocart", async (req, res) => {
  if (req.session.loggedin) {
    const { item_id, item_type, item_price } = req.body;

    try {
      // Checking if there is a pending order yet, if not create one
      const init_order_status_checking_query =
        `SELECT order_status, order_id, user_id FROM orders
        WHERE order_status IS "pending" AND user_id IS "${req.session.user_id}"`;
      const init_order_status_checking_results = await new Promise((resolve, reject) => {
        db.all(init_order_status_checking_query, (error, rows) => (error ? reject(error) : resolve(rows)));
      });
      if (init_order_status_checking_results.length == 0) {
        const init_the_order =
          `INSERT into orders (user_id)
          VALUES (${req.session.user_id});`
        const init_order_res = await new Promise((resolve, reject) => {
          db.run(init_the_order, (error, rows) => (error ? reject(error) : resolve(rows)));
        });
        console.log("Cart created.");
      }
      const get_order_id_query =
      `SELECT order_id FROM orders
       WHERE order_status IS "pending" AND user_id IS "${req.session.user_id}"`;
      const order_id_curr = await new Promise((resolve, reject) => {
        db.all(get_order_id_query, (error, rows) => (error ? reject(error) : resolve(rows)));
      });

      const query_for_add = `INSERT INTO order_items
                             VALUES ("${order_id_curr[0].order_id}", "${item_type}", "${item_id}", 1, "${item_price}")`;
      const adding = await new Promise((resolve, reject) => {
        db.run(query_for_add, (error, rows) => (error ? reject(error) : resolve(rows)));
      });
      console.log("Order Added to cart.");

      res.json({ message: "ส่งมาล้ะ", redirect: '/orderlist' });
    } catch (error) {
      console.error(error.message);
      res.json({ message: "ส่งมาล้ะแต่ Error", redirect: '/orderlist' });
    }
  } else {
    res.json({ message: "ส่งมาล้ะแต่ Error", redirect: '/home' });
  }

  // res.redirect('/home');
});


app.get("/aboutus", (req, res) => {
  res.render('aboutus', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
});

app.get("/faq", (req, res) => {
  res.render('faq', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" });
});

app.all('*', (req, res) => {
  res.render('404', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "" })
});

app.listen(port, () => {
  console.log(`This Web Server is running on port ${port}`);
});

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
  const sql2 = `INSERT INTO pizza_ingredients (pizza_id, ingredient_id, quantity_required)
SELECT 
    (SELECT pizza_id FROM pizzas WHERE pizza_name = "${pizza_name}") AS pizza_id,
    (SELECT ingredient_id FROM ingredients WHERE ingredient_name = "${topping}") AS ingredient_id,
    ${quantity} AS quantity_required;`
  db.all(sql2, (error, results2) => {
    if (error) {
      console.log(error.message);
    }
  })
};
