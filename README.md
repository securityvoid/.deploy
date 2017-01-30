# .deploy
Azure Deploy Scripts for Azure Functions to Webpack &amp; Uglify all node_modules during deploy from source-control.

##Usage:

###Add this repository to your project
This can be done by one of the following options:

1. Fork the project and add it as a submodule to all of your Azure Function projects:
```git submodule add https://github.com/CyberNinjas/.deploy.git```

NOTE: Since this project runs commands on deploy of your code, I highly recommend you fork the project rather than pulling it from here. If not, it  would mean any mistakes we make, might mess up your build :-).

2. Clone the project into the .deploy folder of your project and commit it with your source-code.

###Create a .deployment file so the above files are called.

Create a file called .deployment at the base of your repository with the following contents
```
[config]
command = D:\home\site\repository\.deploy\deploy.cmd
SCM_POST_DEPLOYMENT_ACTIONS_PATH = D:\home\site\repository\.deploy\post-deploy
SCM_COMMAND_IDLE_TIMEOUT=600
```

The first line references the deploy command to run to deploy your code. 

The second line sets a "post-deploy" folder to run commmands after the deploy.cmd finishes. We use this to keep things neater, and make isolating errors easier.

The third line makes it so your script doesn't timeout if there is no output for 10 minutes. Our command to install npm modules sets the progress bar to false, which greatly speeds up npm installs, but also means there is not any output until the install is complete. With the slowness of Azure's file storage NPM installs can take a LONG time. You may need to increase this if you have a large project.


##Other Notes:
The "Master" branch will hold a copy of the script which itself is already Webpacked and Uglified.

The "Dev" branch will hold a copy with a package.json and the node_modules loaded normalled

##Contributing
Think you can optimize this code a little more and make it faster? We welcome and encourage PULL requests.

##DISCLAIMER
Use at your risk. This is made available with no warranties of any type, including warranty for a specific purpose.






