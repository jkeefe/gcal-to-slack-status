# Process Notes

Here's where I keep rough notes on how I made this. I write these to keep track of what I did for the future, not as a clear guide for others. But feel free to wander through with me, and drop me a note if you'd like more info.

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
    
    
### Slack App Building

- Went to the Slack App page and made a new app https://api.slack.com/slack-apps
- Gave permissions to set do not disturb
- Gave permissions to set user profile, which is how the status is set
- Getting the oauth token from there


### Slack Status update

This is done in the app method `user.profile.set`. Details [here](https://api.slack.com/methods/users.profile.set). 
    
    
    
### Slack Emoji translation

Found this resource: https://github.com/iamcal/emoji-data

The `emoji.json` file is what we want. The "short_name" is what slack uses between the colons to name each emoji.

Also using the [emoji-regex](https://github.com/mathiasbynens/emoji-regex) npm module to pull out emoji from strings.

Together, I can build a translator to turn 💻  into `:computer:`.

Also using this from another project:

```
// https://medium.com/reactnative/emojis-in-javascript-f693d0eb79fb
    var emoji_value = args[0].codePointAt(0);
```
    
## Deploying to Claudia

- Switched my local AWS credentials to my ReallyGoodSmarts account
- Create function using:
    ```
    ./node_modules/.bin/claudia create --region us-east-1 --handler index.handler --role lambda-executor
    ```
- Put credentials into the lambda function

- set it to check at :02 and :32 monday through friday ... see [here](https://github.com/claudiajs/claudia/blob/master/docs/add-scheduled-event.md)

```
./node_modules/.bin/claudia add-scheduled-event --cron "02,32 * ? * MON-FRI *" --event payload.json --name update-slack-status-w-gcal
```

- Also made sure the lambda function had enough memory and a few seconds to operate

    
### rrule

SO it turns out that for repeating events, iCal stores the original event (with the original start and end times) and then an object called `rrule` which lays out the recurrence rules for that item. 

This means that in order to see if there is a current _recurring_ event, I'll need to check any event with an `rrule` whose `until` value is either not set or in the future.

Fortunately there's a [npm module](https://github.com/jakubroztocil/rrule) to handle rrules, and I think [this section](https://github.com/jakubroztocil/rrule#rruleprototypebeforedt-incfalse) will be key.

Oh wow. Using this library isn't done in the way I'm used to. But after poking around, the instructions for:

```
import { RRule, RRuleSet, rrulestr } from 'rrule'
```

... can be written this way in the world I'm used to:

```javascript
let {RRule, RRuleSet, rrulestr} = require('rrule')
```

Then all of the functions in the instructions work like they're supposed to.

```javascript
const rule = new RRule({
    freq: RRule.WEEKLY,
    interval: 5,
    byweekday: [RRule.MO, RRule.FR],
    dtstart: new Date(Date.UTC(2012, 1, 1, 10, 30)),
    until: new Date(Date.UTC(2012, 12, 31))
});
```

In this instance, I'm modifying the object that comes from iCal with specifics for RRule ... and adjusting to my needs.

- `freq` needs to be changed from an integer to and RRule thingy
- `dstart` should be a Date-ized version of the original `dstart`
- `until` should be now ... because we're telling RRule to repeat until right now. No need to repeat forever, or even until a declared "until" time (as long as we know it's in the future) since we just want to know if there's an instance that's in effect right now -- and don't care about the others.
- `bynmonthday` and `bynweekday` need to be deleted from the original object for RRule.

```javascript
var recurring = new RRule({
    "freq": RRule.WEEKLY,
    "dtstart": moment.utc("2018-09-19T15:00:00.000Z").toDate(),
    "interval": 1,
    "wkst": 0,
    "count": null,
    "until": moment.utc().toDate(),
    "bysetpos": null,
    "bymonth": null,
    "bymonthday": [],
    "byyearday": null,
    "byweekno": null,
    "byweekday": [
        2
    ],
    "byhour": [
        11
    ],
    "byminute": [
        0
    ],
    "bysecond": [
        0
    ],
    "byeaster": null
});
```

Now we have all of the start times, according to the repetition rules, up to right now:

```bash
> recurring.all()
[ 2018-09-19T15:00:00.000Z,
  2018-09-26T15:00:00.000Z,
  2018-10-03T15:00:00.000Z,
  2018-10-10T15:00:00.000Z,
  2018-10-17T15:00:00.000Z,
  2018-10-24T15:00:00.000Z,
  2018-10-31T15:00:00.000Z ]
```

And actually, we can get "the last recurrence before the given Date instance" using `.before()` ... which, since we're checking at :02 and :32 should give us the last item.

```bash
> recurring.before(moment.utc().toDate())
2018-10-31T15:00:00.000Z
```

Then we can check to see if _now_ is between that datetime and that datetime plus the difference/duration between event.start and event.end, which is the original event.

