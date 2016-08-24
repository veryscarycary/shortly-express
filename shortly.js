var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(session({secret: 'default'}));
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/', 
function(req, res) {
  if (req.session.user) {
    res.render('index');
  } else {
    res.redirect('login');
  }
  // res.render('index');
});

app.get('/create', 
function(req, res) {
  if (req.session.user) {
    res.render('index'); 
  } else {
    res.redirect('login');
  }
});

app.get('/links', 
function(req, res) {
  if(!req.session.user) {
    res.redirect('login');
  } else {
    Links.reset().fetch().then(function(links) {

      links = links.filter(function (link) { return link.get('userId') === req.session.userId; });
      res.status(200).send(links);
    });
    
  }
  // Links.reset().fetch().then(function(links) {
  //   res.status(200).send(links.models);
  // });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(201).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        var user = req.session.user;
        db.knex.select('id').from('users').where({username: user}).then(function(result) {
          console.log(result);
          user = result[0]['id'];
        }).then(function(err, result) {
        // adding a link model to the Links collection
          Links.create({
            url: uri,
            title: title,
            baseUrl: req.headers.origin,
            userId: user
          });
        })
        .then(function() {
          res.status(201).send({url: uri});
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res) {
  // if (req.session.user) {
  //   req.session.destroy(function() {
  //     res.render('login');
  //   });
  // } else {
  res.render('login');
  // }
});


app.post('/login', function(req, res) {
 
  var username = req.body.username;
  var password = req.body.password;

  console.log('username: ', username);
  console.log('pw: ', password);


  db.knex.select('username', 'password', 'id').from('users').where({username: username})
  .then(function(data) {
    if (data.length === 0) {
      res.redirect('login');
    } else {
  //Todo: update pw checking method
      if (password === data[0]['password']) {
        req.session.regenerate(function() {
          req.session.user = username;
          req.session.userId = data[0]['id'];
          res.redirect('/');
        });
      } else {
        res.redirect('login');
      }    
    }
  });
});

app.get('/logout', function(req, res) {
  console.log('logout request received');
  req.session.destroy(function() {
    res.redirect('/');
  });
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  // db.knex.insert({username: 'demo'}).into('users');
  // query the database for existing usernames
  db.knex.select('username').from('users').where({username: username})
  .then(function(data) {
    console.log('DATA', data);
    if (data.length === 0) {
      new User({username: username, password: password}).fetch()
      .then(function(err, success) {
      // create session and loads index
        Users.create({
          username: username,
          password: password
        }).then(function(result) {
          db.knex.select('username', 'id').from('users').where({username: username})
          .then(function(result) {
            console.log('RESULT', result);
            req.session.regenerate(function() {
              req.session.user = username;
              req.session.userId = result[0]['id'];
              res.redirect('/');
              console.log('RES.HEADERS', res.headers);
            });
          });
        });
      });
    }
  });
        

        // res.redirect('login');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
