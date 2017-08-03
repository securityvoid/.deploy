


#THIS SCRIPT IS DEPRECIATED AND UNSUPPORTED

Please use [pack-git](https://github.com/securityvoid/pack-git) instead. 







------------------------------------------------

Below is for posterity purposes only.


# .deploy
Azure Deploy Scripts for Azure Functions to Webpack and Uglify all node_modules during deploy from source-control.

NOTE: This makes deploys take quite a bit to deploy. A simple application may take 10+ minutes to deploy. This is a large part has to do with the slow nature of the file-system that azure functions sit on.

##Usage:

###Add this repository to your project
This can be done by one of the following options:

1. Fork the project and add it as a submodule to all of your Azure Function projects:
```git submodule add https://github.com/CyberNinjas/.deploy.git```

NOTE: Since this project runs commands on deploy of your code, I highly recommend you fork the project rather than pulling it from here. 

2. Clone the project into the .deploy folder of your project and commit it with your source-code.

###Create a .deployment file so the above files are called.

Create a file called .deployment at the base of your repository with the following contents
```
[config]
command = D:\home\site\repository\.deploy\deploy.cmd
SCM_COMMAND_IDLE_TIMEOUT=900
WEBPACK_OUTPUT_FILE = azure.deps.js
DEPLOY_DIST_FOLDER = dist
DEPLOY_EXCLUDE_FOLDERS = [".git", ".deploy", ".idea", "node_modules", "dist"]
```
#### Explanation

The first two lines are standard Azure .deployment entries.
* command: Specifies the command to execute to deploy everything.
* SCM_COMMAND_IDLE_TIMEOUT: Sets the idle timeout for the deploy (e.g. No output to stdout)to 900 seconds. This is done so our npm commands will not time-out since we got rid of the progress bar to make npm faster.

The next three lines have nothing to do with Azure. We used the Node library dotenv and pointed it at this same file so we could store some of our own configuration items. Since we used dotenv, you can specify these here OR you should be able to set them as environmental variables in your app.
* WEBPACK_OUTPUT_FILE: Specifies the name of the Webpacked JavaScript file. Defaults to azure.deps.js if not specified.
* DEPLOY_DIST_FOLDER: Specifies the name of the directory to put the files for deployment once processed. Defaults to dist.
NOTE: If you update this value, you must also define an environmental variable DEPLOYMENT_DIST with the same value. If you do not do this, the final copy from deploy.cmd will fail. 
* DEPLOY_EXCLUDE_FOLDERS: An array of folders that's contents should not be copied into the final distribution.   
NOTE: If this does not JSON.parse(), it will default the value.
NOTE: Anything that is successfully WebPacked into the one JS file will not be copied to the final distribution.


##Other Notes:
The "Master" branch will hold a copy of the script which itself is already Webpacked and Uglified.

The "Dev" branch will hold a copy with a package.json and the node_modules loaded normalled

## How it works
The following is a flow of what this module does.
1. deploy.cmd is initialized and is kicked off due to the reference in the .deployment file.
2. deploy.cmd checks to see if any file called "package.json" has changed since the last deploy. If so, it runs NPM install on that file.
NOTE: There is a current bug where the deploy will stop here if it successfully installs via npm. This is being worked on.
2. deploy.cmd kicks off "deploy.js"
3. deploy.js: Retrieves/defaults the environmental variables.
4. deploy.js: The contents of the DEPLOY_DIST_FOLDER are cleared.
5. deploy.js: A list of base folders in the DEPLOYMENT_SOURCE is created.
6. deploy.js: Each folder is checked for all the dependencies within the index.js file.
7. deploy.js: New index.js files are written to the appropriate folder in DEPLOY_DIST_FOLDER with a reference to the composite dependency file created in step #8, and all requires replaced with references to global.azureDeps as defined in step #8. 
8. deploy.js: A new dependency file is created in DEPOYMENT_SOURCE called WEBPACK_OUTPUT_FILE. This file is an object that references all the requires needed by all of the index.js files.
9. deploy.js: The new dependency file is Webpacked and uglified and the output is written to DEPLOY_DIST_FOLDER.
10. deploy.js: Any files not excluded by DEPLOY_EXCLUDE_FOLDERS, and not successfully added to the Webpack JS file are copied over to DEPLOY_DIST_FOLDER.
11. deploy.cmd: KudoSync is utilized to copy the files from DEPLOY_DIST_FOLDER to DEPLOY_TARGET (e.g. wwwroot)


##Contributing
Think you can optimize this code a little more and make it faster? We welcome and encourage PULL requests.

##DISCLAIMER
Use at your risk. This is made available with no warranties of any type, including warranty for a specific purpose.






