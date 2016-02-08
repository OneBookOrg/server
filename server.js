var express = require('express')
var mongoose = require('mongoose')
var http = require('http')
var path = require('path')
var fs = require('fs')
var bodyParser = require('body-parser')
var hash = require('./pass').hash
var cookieParser = require('cookie-parser')
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);
var app = express();
app.use(express.static('../site'));

var debug = false;


mongoose.connect('mongodb://localhost/OneBookDB');

app.use(session({
	secret : 'shhh, secret',
	resave : true,
	saveUninitialized : true,
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
    cookie: { maxAge: 604800000 }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

require(__dirname+ '/models/users.js');
require(__dirname+'/models/organizations.js');
var User = mongoose.model('users');
var Org = mongoose.model('organizations');


app.get('/', function(req, res){
	res.send("hello, connected.");
});

function authenticate (name, pass, fn){
	
	User.findOne( {'username' : name}, function(err, user){
		if(!user){
			console.log("Error, user does not exist.");
			return fn(new Error('Cannot find user.'), null);
		}
		//Uses the users registration date as their salt value
		else{
			tempSalt = user.register_date.toString().replace(/\s+/g, '');
			hash(pass, tempSalt, function(err, hash){

				if(err) 
					return fn(err, null);
				if(hash.toString('hex') == user.hashcode)
					return fn(null, user);
				else{
					return fn(err, null);
				}
			});
		}
	});
	//fn(new Error('User hashcodes do not match. Invalid Password'));
} 

function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } 
  else {
  	res.json({
  		success : false,
  		errMessage : "Access Denied.",
  		redirect : "/index.html"
  	})
    //res.json({error_message: "Access denied!", cookieValid : false});
    return;
  }
}

app.post('/register', function(req, res){
	var user = new User ({
		username : req.body.username,
		hashcode : "",
		phone_number : req.body.phone_number, //Change phone numbers to a default format easy for searching
		register_date : Date.now()
	});
	//Uses the users registration date as their salt value
	tempSalt = user.register_date.toString().replace(/\s+/g, '');

	hash(req.body.password, tempSalt, function(err, hash){
		
		if(err) return err;
		user.hashcode = hash.toString('hex');

		user.save(function(err){
			if(err){
				res.json({
					success : false,
					error : 'User already exists.'
				});
				return;
			}
			req.session.regenerate(function(){
	            req.session.user = user
	            console.log(user.username + " Has been successfully registered")
				res.json({
					success : true
				});
        	});
			
		});
	});

});

app.post('/login', function(req, res){

	authenticate(req.body.username, req.body.password, function(err, user){
		if(user){
			req.session.regenerate(function(){
		        req.session.user = user;
		        res.json({
		        	success : true
		        });
		        console.log("Auth success for '%s'", user.username);
      		});
		}
		else{
			req.session.error = 'Authentication failed, please check your '
        + ' username and password.';
        	res.json({
        		success : false,
        		errMessage : 'Authentication failed'
        	});
        	//return;
		}
	});
})


app.post('/createOrg', restrict, function(req, res){
	var org = new Org ({
		orgname : req.body.orgname,
		members : [req.session.user.username]
	});

	org.save(function(err){
		if(err){
			res.json({
				success : false,
				error : 'Organization already exists'
			});
			return;
		}


		User.update({username : req.session.user.username}, {$addToSet : {userOrgs : org}}, function(err, result){
			if(err){
				console.log("ERROR updating user info. " + err);
				res.json({
					success : false,
					errMessage : "Could not update user."
				});
				return;
			}
		});

		res.json({
			success : true
		});
		return;
	});
});

app.post('/addUserToOrg', restrict, function(req, res){
	
	Org.findOne({orgname : req.body.orgName}, function(err, org){
		if(err){
			res.json({
				success : false,
				errMessage : "No organization by the name " + req.body.orgName
			});
			return;
		}
		else{
			Org.update({orgname : org.orgname}, {$addToSet : {members : req.session.user.username}}, function(err){
				if(err){
					console.log("ERROR updating organization member "+ err);
					res.json({
						success : false,
						errMessage : "ERROR updating organization member."
					});
					return;
				}
				else{
					
					User.update({username : req.session.user.username}, {$addToSet : {userOrgs : org}}, function(err, result){
						if(err){
							console.log("ERROR updating user info. " + err);
							res.json({
								success : false,
								errMessage : "Could not update user."
							});
							return;
						}
						res.json({
							success : true
						});
					});
				}
			});
	
		}

	});

});

app.get('/userInfo', restrict, function(req, res){
	User.findOne( {'username' : req.session.user.username}, function(err, user){
		if(err){
			console.log("Error, user does not exist. " + err);
			res.json({
				success : false,
				errMessage : "Could not find user information."
			});
			return;
		}
		
		res.json({
			success : true,
			user : user
		});
		
	});
});

app.get('/orgInfo', function(req, res){
	Org.findOne({'orgname' : req.params.orgname}, function(err, org){
		if(err){
			console.log("Error org does not exist. "+ err);
			res.json({
				success : false,
				errMessage : "Could not find organization."
			});
			return;
		}
		res.json({
			success : true,
			org : org
		});
	});
});


app.get('/userOrgs', restrict, function(req, res){
	
	console.log('Getting orgs for ' + req.session.user.username)

	
	Org.find({'members' : req.session.user.username}, function(err, orgs){
		if(err){
			console.log("Error, user does not exist. " + err);
			res.json({
				success : false
			});
			return;
		}
		res.json({
			success : true,
			userOrgs : orgs
		});
		return;
	});


});

app.get('/login', function(req, res){

});

app.get('/logout', function(req, res){
  // destroy the user's session to log them out
  // will be re-created next request
  req.session.destroy(function(err){
  	if(err){
  		res.json({
  			success : false
  		});
  		return;
  	}
  	res.json({
  		success : true,
  		redirect : '/index.html'
  	});

  });
});




var portNumber = 8000;
app.listen(portNumber);


console.log("OneBook server is listening on port " + portNumber)

