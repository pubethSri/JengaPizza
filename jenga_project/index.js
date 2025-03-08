const express = require("express");
const path = require("path");
const port = 3000;
const bodyParser = require("body-parser");
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const { log } = require("console");

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
  res.render('home', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || ""});
});

app.get("/choose", (req, res) => {
  if (req.session.loggedin) {
    res.render('choose', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/category", (req, res) => {
  const sql = `SELECT pizza_name, pizza_id FROM pizzas WHERE user_id = ${req.session.user_id}`
  console.log(`${req.session.user_id}`);
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
      res.render('category', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: [] });
    } else {
      res.render('category', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: results });
    }
  });
});

app.get("/pizza-:pizza_id", (req, res) => {
  const pizza_id = req.params.pizza_id;
  const sql = `SELECT pizza_name, thai_name FROM pizzas
              JOIN pizza_ingredients USING (pizza_id)
              JOIN ingredients USING (ingredient_id)
              WHERE pizza_id = ${pizza_id}
              ORDER BY ingredient_id;`;
  
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
      res.render('pizza-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: [{ pizza_name: 'เจ๊ง', ingredient_name: 'เจ๊ง' }]});
    } else {
      res.render('pizza-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || "", item: results});
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
  const { username, email, password} = req.body;
  const sql = `SELECT * FROM users WHERE username = "${username}" OR user_email = "${email}";`
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
    }
    if (results.length > 0) {
      return res.json({ success: false, message: "ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้ไปแล้ว"});
    } else {
      try {
        const insert_sql = `INSERT INTO users (username, user_email, user_password, user_privilege)
                            VALUES ("${username}", "${email}", "${password}", "customer");`
        db.run(insert_sql);
      } catch (error) {
        console.log(error);
      }
      console.log("User created!");
      return res.json({ success: true });
    }
  })
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  console.log("logged out!");
  res.redirect('/home');
});

app.get("/orderform", (req, res) => {
  res.render('orderform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/createform", (req, res) => {
  res.render('createform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
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
  if(typeof(topping) == "string"){
    topping_adder(topping, pizza_name);
  } else {
    topping.forEach((item) => {
      topping_adder(item, pizza_name);
    });
  }

  res.redirect("/category");
});

app.get("/orderlist", (req, res) => {
  res.render('orderlist', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/tracking", (req, res) => {
  res.render('tracking', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/tracking_seller", (req, res) => {
  res.render('tracking_seller', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/customerinfo", (req, res) => {
  res.render('customerinfo', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/qrpayment", (req, res) => {
  res.render('qrpayment', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

// Updated ingredients seller route to fetch all necessary data
app.get("/ingredients_seller", (req, res) => {
  if(req.session.user_privilege == "admin" || req.session.user_privilege == "employee") {
    const sql = `SELECT ingredient_id, ingredient_name, stock_quantity, thai_name, unit FROM ingredients
                WHERE ingredient_name NOT LIKE "%\\_%" ESCAPE "\\";`
    db.all(sql, (error, results) => {
      if (error) {
        console.log(error.message);
        res.render('ingredients_seller', { 
          loggedin: req.session.loggedin, 
          username: req.session.username || "", 
          user_privilege: req.session.user_privilege || "",
          ingredient: []
        });
      } else {
        console.log(results);
        res.render('ingredients_seller', { 
          loggedin: req.session.loggedin, 
          username: req.session.username || "", 
          user_privilege: req.session.user_privilege || "", 
          ingredient: results
        });
      }
    });
  } else {
    res.redirect("/home");
  }
});

// route to handle inventory updates
app.post("/update-stock", (req, res) => {
  if(req.session.user_privilege !== "admin" && req.session.user_privilege !== "employee") {
    return res.status(403).send("Access denied");
  }

  const { ingredient_id, quantity, operation, current_stock } = req.body;
  
  // Input validation
  if (!ingredient_id || !quantity || !operation) {
    return res.status(400).send("Missing required parameters");
  }
  
  // Convert quantity to number
  const changeAmount = parseInt(quantity);
  if (isNaN(changeAmount) || changeAmount <= 0) {
    return res.status(400).send("Invalid quantity");
  }
  
  // Get current stock from database to ensure we have the latest value
  const checkSql = `SELECT stock_quantity FROM ingredients WHERE ingredient_id = ?`;
  
  db.get(checkSql, [ingredient_id], (error, result) => {
    if (error) {
      console.error("Database error:", error.message);
      return res.status(500).send("Database error");
    }
    
    if (!result) {
      return res.status(404).send("Ingredient not found");
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
    const updateSql = `UPDATE ingredients SET stock_quantity = ? WHERE ingredient_id = ?`;
    
    db.run(updateSql, [newStock, ingredient_id], function(error) {
      if (error) {
        console.error("Update error:", error.message);
        return res.status(500).send("Update failed");
      }
      
      console.log(`Stock updated: Ingredient #${ingredient_id} ${operation}d by ${changeAmount}. New stock: ${newStock}`);
      
      // Redirect back to the ingredients page
      res.redirect("/ingredients_seller");
    });
  });
});

app.get("/aboutus", (req, res) => {
  res.render('aboutus', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/faq", (req, res) => {
  res.render('faq', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.all('*', (req, res) => {
  res.send("You should not be here and this page is 404 not found");
});

app.listen(port, () => {
  console.log(`This Web Server is running on port ${port}`);
});

let price_calc = (dough, size, topping) => {
  var dough_spec = 1;
  var size_spec = 1;

  if(dough == "cheese_crust" || dough == "sausage_crust"){
    var dough_spec = 1.3;
  }

  if(size == "M"){
    var size_spec = 1.4;
  }else if(size == "L"){
    var size_spec = 1.8;
  }else if(size == "XL"){
    var size_spec = 2.2;
  }

  if(typeof(topping) == "string"){
    var price = Math.floor((150 * dough_spec) + (100 * size_spec) + (49));
  }else{
    var price = Math.floor((150 * dough_spec) + (100 * size_spec) + (Math.max(topping.length-2, 1)* 49));
  }

  return price;
};

let topping_adder = (topping, pizza_name) => {
  var quantity = 50
  if(topping.search("sauce") != -1){
    quantity = 250;
  }else if(topping.search("crust") != -1 || topping.search("original") != -1 || topping.search("crispy") != -1){
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
  });
};