const express = require("express");
const path = require("path");
const port = 3000;
const bodyParser = require("body-parser");
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

// Connect to SQLite database
let db = new sqlite3.Database("data/pizzeria.db", (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Connected to the Pizzeria database.');
});

// Creating the Express server
const app = express();


// start session i guess?????
app.use(session({
  secret: 'secret',
  resave: true,
  saveUninitialized: true
}));

app.use(express.json());

app.use(bodyParser.urlencoded({ extended: true }));
// static resourse & template engine
app.use(express.static("views"));

// Set EJS as templating engine
app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.render('Landing');
});

app.get("/home", (req, res) => {
  res.render('home', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || ""});
  // console.log(req.session.user_privilege);
});



app.get("/choose", (req, res) => {
  if (req.session.loggedin) {
    res.render('choose', { loggedin: req.session.loggedin, username: req.session.username, user_privilege: req.session.user_privilege || "" });
  } else {
    res.redirect('/home');
  }
});

app.get("/category", (req, res) => {
  res.render('category', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/pizza-name", (req, res) => {
  res.render('pizza-name', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.post("/authen", async (req, res) => {
  const { username, password } = req.body;
  const sql = `SELECT * FROM users WHERE username = "${username}" AND user_password = "${password}"`
  db.all(sql, (error, results) => {
    if (error) {
      console.log(error.message);
    }
    if (results.length > 0) {
      req.session.loggedin = true;
      req.session.username = username;
      req.session.user_privilege = results[0].user_privilege;
      console.log("logged in!");
      res.redirect('/home');
    } else {
      res.send("incorrect password and/or password!");
    }
    res.end();
  })
})

app.get("/logout", (req, res) => {
  req.session.destroy();
  // console.log(req.session.loggedin);
  // console.log(req.session.username);
  console.log("logged out!");
  res.redirect('/home');
})
app.get("/orderform", (req, res) => {
  res.render('orderform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
});

app.get("/createform", (req, res) => {
  res.render('createform', { loggedin: req.session.loggedin, username: req.session.username || "", user_privilege: req.session.user_privilege || ""});
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
  res.render('customerinfo', { loggedin: req.session.loggedin });
});

app.listen(port, () => {
  console.log(`This Web Server is running on port ${port}`);
});
