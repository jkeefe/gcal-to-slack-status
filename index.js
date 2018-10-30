// Require modules here
const ical = require('ical');
const slack = require('slack');

// to set this locally, do: export GCAL_SECRET_URL=https://xyzabc ...
const calendar_url = process.env.GCAL_SECRET_URL;


// Include global variables here (if any)

exports.handler = function(event, context, callback){ 

    // funtional code goes here ... with the 'event' and 'context' coming from
    // whatever calls the lambda function (like CloudWatch or Alexa function).
    // callback function goes back to the caller.
    
    var send_back = "OK";
    
    getCalendar(calendar_url)
    .then((data) => {
        
        for (var k in data) {
            
            var event=data[k];
            console.log("---");
            console.log(JSON.stringify(event));
            
        }
        
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