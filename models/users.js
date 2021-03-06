var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema ({
	username : {
		type : String,
		unique : true
	},
	display_name : {
		type : String,
		unique : true
	},
	userOrgs : [

	],
	userClasses : [
	
	],
	phone_number : Number,
	hashcode : String,
	//Using register_date as salt val
	register_date : Date
});

mongoose.model('users', userSchema);
