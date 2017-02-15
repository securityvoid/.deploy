'use strict';
const lib = require('./lib');
const webpack = require("webpack");

lib.createDistribution(webpack).then(function(results){
    console.log("SUCCESS!");
    process.exit(0);
}, function(err){
    console.log("FAILURE!");
    console.log(JSON.stringify(err));
    process.exit(1);
}).catch(function(error){
    console.log("ERROR!");
    console.log(JSON.stringify(error));
    process.exit(1);
});
