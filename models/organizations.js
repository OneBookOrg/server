var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var organizationSchema = new Schema ({
	orgname : {
		type :String,
		unique : true
	},
	members : []
});

mongoose.model('organizations', organizationSchema);