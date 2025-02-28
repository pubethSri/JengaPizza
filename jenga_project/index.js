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

app.listen(port, () => {
  console.log(`This Web Server is running on port ${port}`);
});
