'use strict';
const exec = require('child_process').exec;
const fs = require('fs-extra');
const path = require('path');
const q = require("q");

fixUglify().then(function(result){
    console.log(result.message);
}, function(err){
    console.log(JSON.stringify(err));
});

function fixUglify(){
    var deferred = q.defer();
    var uglifyPath = path.join(__dirname, "node_modules", "uglify-js" );

    if(fs.existsSync(path.join(uglifyPath, "lib", "index.js"))){
        deferred.resolve({success: true, action: "Already uglified", message: "Already uglified!"});
    }
    //Generate Self-Uglified Uglify JS.
    exec('node bin/uglifyjs --self -o uglify.js', {cwd: uglifyPath }, function(error, stdout, stderr) {
        if(error){
            deferred.reject({success: false, action: "Self-uglify", error: error, stdout: stdout, stderr: stderr});
        } else {
            //Move lib directory to lib2
            fs.rename(path.join(uglifyPath, "lib"), path.join(uglifyPath, "lib2"), function(err){
                if(err){
                    deferred.reject({success: false, action: "rename uglify lib", error: err });
                } else {
                    //Make the libdir again
                    fs.mkdir(path.join(uglifyPath, "lib"), function(err){
                        if(err){
                            deferred.reject({success: false, action: "make new uglify lib", error: err });
                        } else {
                            //Move the output from Uglify to index.js, so its now what is referenced.
                            fs.rename(path.join(uglifyPath, "uglify.js"), path.join(uglifyPath, "lib", "index.js"), function(err){
                                if(err){
                                    deferred.reject({success: false, action: "move uglify lib", error: err });
                                } else {
                                    deferred.resolve({success: true, action: "move uglify lib", message : "Complete!"});
                                }
                            });
                        }
                    });
                }

            });
        }
    });
    return deferred.promise;
}





