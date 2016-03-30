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
app.use(express.static('../web/site'));

var debug = false;


mongoose.connect('mongodb://localhost/OneBookDB');

//session setup
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

				if(hash.toString('hex') == user.hashcode){
				 	return fn(null, user); 
				} 
				else {
					return fn(err, null);
				}
				
			});
		}
	});
	//fn(new Error('User hashcodes do not match. Invalid Password'));
} 

function authenticateOrg(org, pass, fn){
	
	tempSalt = org.create_date.toString().replace(/\s+/g, '');
	hash(pass, tempSalt, function(err, hash){
		if(org.hashcode == hash.toString('hex')){
			return fn(null);
		}
		else{
			return fn(new Error('Passwords do not match'));
		}
	});

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
  	});
    //res.json({error_message: "Access denied!", cookieValid : false});
    return;
  }
}


/*
	When calling /register the data passed in must be with the formatting and naming below
	{
		username : "",
		password : "",
		phone_number : ""
	}

	returns a json object with a success flag.
*/

app.post('/register', function(req, res){
	var user = new User ({
		username : req.body.username.toLowerCase(), //Not case sensitive
		display_name : req.body.username,
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

/*
	/login must pass the username and password in to be a valid request
	{
		username : "",
		password : ""
	}

	returns a json object with a success flag
*/
app.post('/login', function(req, res){

	if(!req.body.username || !req.body.password){
		res.json({
			success : false,
			errMessage : "No username or password provided"
		});

		return;
	}

	authenticate(req.body.username.toLowerCase(), req.body.password, function(err, user){
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
			req.session.error = 'Authentication failed, please check your '+' username and password.';
			res.json({
				success : false,
				errMessage : 'Authentication failed'
			});
			//return;
		}
	});
})

/*
	/createOrg will create a new organization and add the user to the organization 
	must take in the following data to be a valid request:
	
	if password protected:
	{
		orgname : "",
	}
	if no password protection:
	{
		orgname : "",
		password : ""
	}

	returns a json object with a success flag

*/
app.post('/createOrg', restrict, function(req, res){
	var org = new Org ({
		orgname : req.body.orgname.toLowerCase(),
		org_display_name : req.body.orgname,
		members : [req.session.user.username],
		hashcode : "",
		create_date: Date.now(),
		passwordProt : false
	});

	
	//If there is no password on this org
	if(!req.body.password){
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

			console.log("Successfully created organization " +org.orgname);
			res.json({
				success : true
			});
			return;
		});
	}
	//Org is password protected it
	else{
		org.passwordProt = true;
		tempSalt = org.create_date.toString().replace(/\s+/g, '');
		hash(req.body.password, tempSalt, function(err, hash){
			if(err){ 
				return err;
			}
			org.hashcode = hash.toString('hex');

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
				console.log("Successfully created organization " +org.orgname);
				res.json({
					success : true
				});
				return;
			});

	});
	}
	

	
});

/*

	/addUserToOrg will first authenticate the organization with the passwordword provided, then if 
	the authentication is successful it needs the following data:

	if organization is password protected:
	{
		orgName : "",
		password : ""
	}
	if no password protection:
	{
		orgName : ""
	}

	returns a json object with a success flag

*/
app.post('/addUserToOrg', restrict, function(req, res){
	Org.findOne({'orgname' : req.body.orgName.toLowerCase()}, function(err, org){
		if(!org){
			console.log("Error, org does not exist.");
			res.json({
				success : false,
				errMessage : "Org does not exists"
			});
			return;
		}
		//Org is password protected
		else if(org.passwordProt){
			if(!req.body.password){
				console.log("No Password Provided.");
				res.json({
					success : false,
					errMessage : "No password provided."
				});
				return;
			}

			authenticateOrg(org, req.body.password, function(err){
				if(err){
					console.log("Password does not match the org password.");
					res.json({
						success : false,
						errMessage : "Password does not match org password."
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
		}
		//No password for the organization
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



/*
	/userInfo does not need any data. It will return the users information based on 
	their current session. If no session is found, false is returned.
	If the user has a session a json object is returned with a success flag and a user object named user.

*/
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

/*
	/orgInfo takes in as a parameter orgname, example shown below. It will return the organization information based. 
	returns a json object with a success flag. If true the object contains the organization named org.
	
	ex) /orgInfo?orgname=TestOrg
*/
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


/*
	When calling /addUserClass the data must be passed in this specific format:
	{
	  "newClass":[
	      {"classID":"PHY1234", "classDesc":"Physics I"}, 
	      {"classID":"ABC3456", "classDesc":"ABC Class"},
	      {"classID":"PHY1234"}
	  ]
	}

	ClassID is mandatory but classDesc is optional.
*/

app.post('/addUserClass', restrict, function(req, res){

	if(!req.body.classID && false){
		res.json({
			success : false,
			errMessage : "No Class ID provided"
		});
		console.log("No class ID provided");
		return;
	}
	else{


		var classArr = [];
		var length = req.body.newClass.length;
		
		for(var i = 0; i<length; i++){
			var newClass = {
				classID : req.body.newClass[i].classID,
				classDesc : ""
			}
			if(req.body.newClass[i].classDesc){
				newClass.classDesc = req.body.newClass[i].classDesc
			}
			classArr.push(newClass);
		} 

		classArr.forEach(function(classEntry){
			User.update({username : req.session.user.username}, {$addToSet : {userClasses : classEntry}}, function(err, result){
				if(err){
					console.log("ERROR updating user class Info. " + err);
					res.json({
						success : false,
						errMessage : "Could not update user."
					});
					return;
				}

			});

		});

		console.log("Success adding users classes.");
			res.json({
				success : true
			});
		
	
	}

});

app.get('/findClassmates/:searchID', function(req, res){
	console.log(req.params.searchID)
	User.find({'userClasses.classID' : req.params.searchID}, {'username' : 1}, function(err, users){
		if(err){
			res.json({
				success : false,
				errMessage : "Error finding users in that specific class"
			});
			return;
		}
		res.json({
			success : true,
			users : users
		});

	});
});




var portNumber = 8000;
app.listen(portNumber);


console.log("OneBook server is listening on port " + portNumber)

