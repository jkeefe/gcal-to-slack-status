# Process Notes

Here's where I keep rough notes on how I make this.


## The plan

Goal is to check my Google calendar regularly (every 15 mins? 5 mins?) and use details in the description field to update the emoji and text in my slack status. 

Really appreciated [this post](https://medium.com/@bjork24/syncing-your-slack-status-with-google-calendar-because-nothing-is-sacred-anymore-3032bd171770), and got great info from it, especially about the slack-status info.

Because this is my work account, I'm try to be sensitive about authorizing things (like IFTTT) to give access to my account. So decided on another route, using the "Secret Address in iCal format" from my google calendar (Settings > Share with Specific People).

Also, while I love how Dan makes it easy to deploy on Heroku, I usually play in (the considerably more complicated) AWS world with Lambda and understand the security stuff there, so going with that.

Here's the rough plan:

- Create a lambda function that runs every 5 minutes.
- Have it check the Secret Google Calendar address for all my calendar info
- Parse the iCal format
    - https://www.npmjs.com/package/ical
- Look for anything happening right now
- See if there's a line in the description that starts: `jk-slack` ... ie: ```jk-slack 🌮`Lunch with team```
- Grab any emoji, emoji name and text
    - Check out the emoji detector I made for Quartz's messenger bot
- Update or clear my slack status
    - https://www.npmjs.com/package/slack

## Setup

- Added `.gitignore`
- Added this process notes doc
- Used my "basic lambda setup" [here](https://github.com/jkeefe/basic-lambda-setup)
- installed a bunch of things:
    ```
    npm init --yes
    npm install claudia --save-dev
    npm install ical slack --save
    ```
    
- Loaded the things I need:

    ```
    npm install ical slack --save
    ```
- Added `test.js` from my [basic lambda setup](https://github.com/jkeefe/basic-lambda-setup)
    
    
    
    
    
    
    
    
    
TODO

- Switch my local AWS credentials to my ReallyGoodSmarts account
- Create function using:
    ```
    ./node_modules/.bin/claudia create --region us-east-1 --handler index.handler --role lambda_basic_execution
    ```
- Stored my "Secret Address in iCal Format" as an environment variable by going to the AWS console for that lambda function and adding the variable SECRET_GCAL_ADDRESS.




