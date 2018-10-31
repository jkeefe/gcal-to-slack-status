// Require modules here
const ical = require('ical');
const slack = require('slack');
const moment = require('moment');

// to set this locally, do: export GCAL_SECRET_URL=https://xyzabc ...
const calendar_url = process.env.GCAL_SECRET_URL;
const slack_token = process.env.SLACK_AUTH_TOKEN;

// Include global variables here (if any)

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
        
    });
    

};

// Helper functions can go here
function getCalendar(url) {
    
    return new Promise((resolve,reject) => {
        
        ical.fromURL(url, {}, function(err, data) {
            
            if (err) {
                reject("Error getting calendar!");
                return;
            }
            
            resolve(data);
            return;
            
        });
        
        
    });
    
}

function scanEvents(data) {
    
    return new Promise ((resolve,reject) => {
        
        var now = moment();
        
        // loop through the events
        for (var k in data) {
            
            var event=data[k];
            
            // is the event happening now?
            var start = moment(event.start);
            var end = moment(event.end);
            
            // event is happening now
            if (now.isBetween(start,end)) {
                
                // check to see if I made event or accepted it
                var accepted = true;
                
                // note that only other peoples' events have "attendee" objects
                // (so those without I must have created, and accepted remains 'true')
                if (event.hasOwnProperty("attendee")){
                    for (var item in event.attendee) {
                        if (item.params.CN == "jk@qz.com" && item.params.PARTSTAT != "ACCEPTED") {
                            accepted = false;
                        }
                    }
                }
                
                // bails out on the first event happening now that I've accepted 
                if (accepted) {
                    resolve(parseStatus(event));
                    return;
                }
                
            }
            
        }
        
        // no event now
        // set blank status, clear DND
        resolve("no status");
        return;
        
    });
    
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
        
        slack.users.profile.set({
            token: slack_token,
            profile: JSON.stringify(status_data)
        })
        .then(()=>{
            resolve("done");
        });
        
    });
    
}