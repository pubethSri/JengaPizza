const express = require("express");
const path = require("path");
const port = 3000;

// Creating the Express server
const app = express();

// static resourse & template engine
app.use(express.static("views"));

// Set EJS as templating engine
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.render('Landing');
});

app.get("/home", (req, res) => {
  res.render('home');
});

app.get("/choose", (req, res) => {
  res.render('choose');
});

app.get("/category", (req, res) => {
  res.render('category');
});

app.get("/pizza-name", (req, res) => {
  res.render('pizza-name');
});

app.get("/orderform", (req, res) => {
  res.render('orderform');
});

app.get("/createform", (req, res) => {
  res.render('createform');
});

app.get("/orderlist", (req, res) => {
  res.render('orderlist');
});

app.listen(port, () => {
  console.log(`This Web Server is running on port ${port}`);
});
