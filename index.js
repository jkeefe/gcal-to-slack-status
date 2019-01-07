// Require modules here
const ical = require('ical');
const slack = require('slack');
const moment = require('moment');
let {RRule, RRuleSet, rrulestr} = require('rrule');

// to set this locally, do: export GCAL_SECRET_URL=https://xyzabc ...
const calendar_url = process.env.GCAL_SECRET_URL;
const slack_token = process.env.SLACK_AUTH_TOKEN;

// Include global variables here (if any)
const freq_array = [RRule.YEARLY, RRule.MONTHLY, RRule.WEEKLY, RRule.DAILY, RRule.HOURLY, RRule.MINUTELY, RRule.SECONDLY];

exports.handler = function(event, context, callback){ 

    // funtional code goes here ... with the 'event' and 'context' coming from
    // whatever calls the lambda function (like CloudWatch or Alexa function).
    // callback function goes back to the caller.
    
    var send_back = "OK";
    
    getCalendar(calendar_url)
    .then(scanEvents)
    .then(updateSlack)
    .then((end_result) =>  {
        
        console.log(end_result);
        
        // format is callback(error, response);
        callback(null, send_back);
        
    })
    .catch((err) => {
        console.log(err);
        callback(err);
    });
    

};

// Helper functions can go here
function getCalendar(url) {
    
    return new Promise((resolve,reject) => {
        
        console.log("Fetching iCal file ...");
        
        ical.fromURL(url, {}, function(err, data) {
            
            if (err) {
                reject("Error getting calendar!");
                return;
            }
            
            //// Careful, this can be pretty big:
            // console.log("Full data file:", JSON.stringify(data));
            resolve(data);
            return;
            
        });
        
        
    });
    
}

function scanEvents(data) {
    
    return new Promise ((resolve,reject) => {
        
        var now = moment();
        
        console.log("Scanning events ...");
        
        // loop through the events
        for (var k in data) {
            
            var event=data[k];
            
            console.log("---");
            console.log(`Event: ${event.summary} ${JSON.stringify(event)}`);
            
            // Check to see if I've accepted the event ...
            // if there's no "attendee" property, then I made the event for myself
            // if there's just one attendee, it is likely me. This seem to be because 
            ///  the organizer has hidden the others or the list is too long for Google to share
            // if I make a multiple-attendee event, I am automatically flagged as accepted
            if (event.hasOwnProperty("attendee")){
                var seems_legit = false;
                
                // if there's only one attendee, "attendee" is an object (so no "length")
                // Otherwise it's an array. So it goes.
                if (!event.attendee.length) {
                    
                    if (event.attendee.params.CN == "jk@qz.com" && event.attendee.params.PARTSTAT == "ACCEPTED") {
                        seems_legit = true;
                    }
                    
                } else {
                
                    // loop through the attendees
                    for (var i in event.attendee) {
                        if (event.attendee[i].params.CN == "jk@qz.com" && event.attendee[i].params.PARTSTAT == "ACCEPTED") {
                            seems_legit = true;
                        }
                    }
                }
                
                if (!seems_legit) {
                    console.log("Skipping! You haven't accepted this event.");
                    continue;
                }        
            }
            
            // skip if pingboard has added it to my calendar
            if (event.hasOwnProperty("organizer")) {
                if ( event.organizer.params.CN.match(/pingboard/u)) {
                    console.log ("Skipping! Pingboard made this event.");
                    continue;
                }   
            }
            
            // skip if the event is "transparent" ... which means "free" not "busy"
            if (event.hasOwnProperty("transparency")) {
                if (event.transparency == "TRANSPARENT") {
                    console.log("Skipping! Event is transparent, indicating free time.");
                    continue;
                }
            }
            
            
            // is this a single or inital event happening now?
            var start = moment(event.start);
            var end = moment(event.end);
            
            // check for a single event, where we're now between its  
            // start and end times
            if (now.isBetween(start,end)) {
                
                // yes, event is happening now
                
                // resolve back to main code on the first event happening now that I've accepted 
                console.log("Accepting! This single event is happening now.");
                resolve(parseStatus(event));
                return;
                
            }
            
            // is the event a RECURRING event? 
            if (event.hasOwnProperty("rrule")) {
                    
                var recurring_event_check = recurringEventIsHappeningNow(event);
                
                // will be either false or will contain the event end time
                
                if (recurring_event_check) {
                    
                    // set the present event end time to the recurring event end time
                    // so we pass the right expiration time to Slack
                    event.end = recurring_event_check;
                    
                    // resolve back to main code
                    console.log("Accepting! This recurring event is happening now.");
                    resolve(parseStatus(event));
                    return;
                    
                }
                    
            }   
            
            console.log("This event doesn't seem to be happening now."); 
            
        }
        
        // no event now
        console.log("None of the events are happening now.");
        resolve(null);
        return;
        
    });
    
}

function recurringEventIsHappeningNow(event){
    
    var now = moment.utc();
    
    // only check events that either recur forever 
    // (aka 'until' is null, and until_time is not valid) 
    // or are set to recur until at least the start of this half hour,
    // which, when this runs, will be about 2-3 minutes ago. Using 5 to be safe.
    var until_time = moment(event.rrule.options.until);
    
    if (!until_time.isValid() || until_time.isSameOrAfter(now.subtract(5,'minutes'))) {
        
        // need to update the options a bit from
        // Google Calendar for use in rrule.
        // See PROCESS_NOTES.md for more info
        
        // start with the original recurrance rule options in the Google Cal event
        var modified_rule_options = event.rrule.options;
        
        // and change a few things for the rrule package
        modified_rule_options.freq = freq_array[event.rrule.options.freq];
        modified_rule_options.dtstart = moment.utc(event.rrule.options.dtstart).toDate();
        delete modified_rule_options.bynmonthday;
        delete modified_rule_options.bynweekday;
        
        // only generate events through the end of today
        modified_rule_options.until = now.endOf('day').toDate();
        
        // generate the recurrances based on the rules
        // (can view them with recurring.all() )
        var recurring = new RRule(modified_rule_options);
        
        // get the start time of the last recurrence before now (as a Date instance)
        var last_recurrance_start = recurring.before(now.toDate(), {inc:true});
        
        // to get the end time of the last recurrance, we need the duration of the original event
        var original_duration = moment(event.end).diff(moment(event.start));
        
        // now we can calculate the end time of the last recurrance
        var last_recurrance_end = moment(last_recurrance_start).add(original_duration);
        
        console.log("last_recurrance_start", last_recurrance_start);
        console.log("last_recurrance_end", last_recurrance_end.format("llll"));
        console.log("registering time now", now.format("llll"));
        console.log("now.isBetween(last_recurrance_start, last_recurrance_end)", now.isBetween(last_recurrance_start, last_recurrance_end));
        console.log("all recurring", recurring.all());
        
        // finally, return either the new end time or 'false' depending on whether _now_ is between
        // the start time of the last recurrence and the end time of the last recurrence
        if (now.isBetween(last_recurrance_start, last_recurrance_end)) {
            
            return last_recurrance_end.format();
            
        } 
        
    }
    
    return false;
    
}

function parseStatus(event){
    
    // default: I'm in a meeting
    var status = {
        "status_text": "In a meeting",
        "status_emoji": ":calendar:",
        "status_expiration": moment(event.end).unix()
    };
        
    // if there's an emoji in the summary, use it + words. So 💻 => 💻 Coding
    
    // if the summary contains "in transit" 
    if (event.summary.match(/in transit/i)) {
        status.status_text = "In transit";
        status.status_emoji = ":runner:";
    }
    
    // if I'm eating
    if (event.summary.match(/lunch/i) || event.summary.match(/eat/i)) {
        status.status_text = "Eating";
        status.status_emoji = ":taco:";
    }
    
    // if I'm out, I usually use "JK out"
    if (event.summary.match(/jk out/i)) {
        status.status_text = "Out and about";
        status.status_emoji = ":beach_with_umbrella:";
    }
    
    // if there's `jkstat :electionland: Working on electionland` in description, use that
    var description_check = event.description.match(/jkstat (:.*:) (.*)$/);
    if (description_check) {
        status.status_text = description_check[2];
        status.status_emoji = description_check[1];
    }
    
    return status;
    
}

function updateSlack(status_data) {
    
    return new Promise ((resolve,reject) => {
        
        // bail if there's no event
        if (!status_data) {
            resolve("no events");
            return;
        }
        
        slack.users.profile.set({
            token: slack_token,
            profile: JSON.stringify(status_data)
        })
        .then(()=>{
            resolve("done");
        })
        .catch((err) => {
            console.log(err);
        });
        
    });
    
}