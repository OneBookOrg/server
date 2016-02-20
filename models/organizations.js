var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var organizationSchema = new Schema ({
	orgname : {
		type :String,
		unique : true
	},
	org_display_name : {
		type : String,
		unique : true
	},
	members : [],
	hashcode : String,
	create_date : Date,
	passwordProt : false
});

mongoose.model('organizations', organizationSchema);