const express = require("express");
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
require("dotenv").config();
const app = express();
var bodyParser = require('body-parser');
const PORT = process.env.PORT || 3000;

const initializePassport = require("./passportConfig");

initializePassport(passport);

app.use(express.urlencoded({ extended: false }));
app.set("view engine", "ejs");
app.use('/public',express.static('public'));
app.use(bodyParser.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register.ejs");
});

app.get("/users/login", checkAuthenticated, (req, res) => {
  console.log(req.session.flash.error);
  res.render("login.ejs");
});

app.get("/users/chat", checkNotAuthenticated, (req, res) => {
  console.log(req.isAuthenticated());
  res.render("chat", { user: req.user.name , api_key: req.user.hftoken, uid: req.user.user_id, prmpt: "You are roleplaying as Chief Justice Neuvillette who is the Iudex of Fontaine, and the leader of the Marechaussee Phantom. While Neuvillette upholds the rules of the court with utmost reverence, he is quite aloof when dealing with human emotions and often distances himself from the public eye."});
});

app.get("/users/logout", (req, res) => {
  req.logout();
  res.render("index", { message: "You have logged out successfully" });
});

app.post("/users/register", async (req, res) => {
  let { name, email, password, password2, hftoken } = req.body;

  let errors = [];

  console.log({
    name,
    email,
    password,
    password2,
    hftoken
  });

  if (!name || !email || !password || !password2 || !hftoken) {
    errors.push({ message: "Please enter all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password must be a least 6 characters long" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    res.render("register", { errors, name, email, password, password2, hftoken });
  } else {
    hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    pool.query(
      `SELECT * FROM users
        WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          console.log(err);
        }
        console.log(results.rows);

        if (results.rows.length > 0) {
          return res.render("register", {
            message: "Email already registered"
          });
        } else {
          pool.query(
            `INSERT INTO users (user_id, username, passwords, email, hftoken)
                VALUES (nextval('seq'),$1, $3, $2, $4)`,
            [name, email, hashedPassword, hftoken],
            (err, results) => {
              if (err) {
                throw err;
              }
              pool.query(
                `SELECT user_id FROM users WHERE email = $1`,
                [email],
                (err, results) => {
                  if (err) {
                    throw err;
                  }
                  const user = results.rows[0];
                  let tname = 'chat_history_' + user.user_id;
                  console.log(tname);
                  pool.query(
                    `CREATE TABLE ${tname} (chat_id INT, chats varchar(1024))`,
                    (err, results) => {
                      if (err) {
                        throw err;
                      }
                    }
                  );
                }
              );
              console.log(results.rows);
              req.flash("success_msg", "You are now registered. Please log in");
              res.redirect("/users/login");
            }
          );
        }
      }
    );
  }
});

app.post(
  "/users/login",
  passport.authenticate("local", {
    successRedirect: "/users/chat",
    failureRedirect: "/users/login",
    failureFlash: true
  })
);

app.get("/users/reset", checkNotAuthenticated, (req, res) => {
  console.log(req.isAuthenticated());
  res.render("reset.ejs", { user: req.user.username });
}
);


app.get('/users/chat-history', (req, res) => {
    let tname = 'chat_history_' + req.user.user_id;
    console.log(tname);
    let user = null;
    pool.query(`SELECT * FROM ${tname}`, (eror, results) => {
    if (eror) {
    }
     user = results.rows;
     res.render('history.ejs', { userdata: results.rows });
  });
    
});


app.post(
  "/users/reset",async (req, res) => {
  let { password, password2, } = req.body;
  let errors= [];
  if (!password || !password2 ) {
    errors.push({ message: "Please enter all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password must be at least 6 characters long" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    res.render("reset", {errors, password, password2});
  } else {
  hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    var user= req.user;
    email = user.email;
    pool.query(
      `SELECT * FROM users
        WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          console.log(err);
        }
        const user = results.rows[0];
        if (user.email == [email]) {
        pool.query(`UPDATE users SET passwords = $2 WHERE email = $1`,[email, hashedPassword]);}
      });
    
  }
    req.logout();
    res.render("index", { message: "Password has been reset. Log in again with the new Password" });
  }
);

app.post(
  "/users/tokenreset", async (req, res) => {
    let { htkn } = req.body;
    var user= req.user;
    email = user.email;
    pool.query(`UPDATE users SET hftoken = $2 WHERE email = $1`,[email, htkn]);
    res.render("index", { message: "Your Hugging Face Token Has been updated" });
});


app.post(
  "/users/api/server", async(req, res) => {
  let { user_id, chat_id, chats } = req.body;
  console.log(user_id,chat_id , chats);
  pool.query(`INSERT INTO ${user_id} VALUES($1 , $2)`, [chat_id, chats] ,(error,results,fields) =>{
        if(error) throw(error);
        res.end(JSON.stringify(results));
  });
}
);



function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/users/chat");
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/login");
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
