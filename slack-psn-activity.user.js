// ==UserScript==
//
// @name         slack-psn-activity
// @namespace    http://tampermonkey.net/
// @version      0.9.4
// @description  Post notifications of activity to a Slack community
// @author       Alex Shaffer (alex@nosuch.org)
// @match        https://my.playstation.com/whatsnew
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @connect      hooks.slack.com
// @run-at       document-idle
// ==/UserScript==

(function() {

    'use strict';

    GM.registerMenuCommand("Set Slack Webhook",configSlackHook);
    GM.registerMenuCommand("Set Friends Names",setFriendRealNames);
    GM.registerMenuCommand("Force Slack Notification",forceNotice);
    GM.registerMenuCommand("Send message to Slack",saySomething);

    var pollDelay = 30*1000; // Delay is in milliseconds. This will update every half minute.
    var refreshPeriod = 8 * 60 * 1000; // Time to refresh the whole page, in milliseconds. Default is 8 hours.

    var slackHook = "";
    var psnFriends = [];
    var lastMsg = "";
    var forceNotify = false;
    var lastRefresh = new Date();


    var getSlackHook = GM.getValue("slack-psn-activity_hook", "");

    getSlackHook.then(function(value) {

        slackHook = value;

        if (!slackHook) {
            configSlackHook();
        }

    });

    var getPsnFriends = GM.getValue("slack-psn-activity_friends", []);

    getPsnFriends.then(function(value) {

        psnFriends = value;

        psnFriends.forEach(function(friend, index) {

            friend.status="unknown";
            friend.game="none";

        });

    });

    var getLastSlack = GM.getValue("slack-psn-activity_lastmsg", "");

    getLastSlack.then(function(value) {

        lastMsg = value;

    });

    window.addEventListener('load', function() {

        setTimeout(pollFriendStatus,pollDelay);

    }, false);


    function pollFriendStatus() {

        // We poll in this function so that the timeout will get set even if there's an error.
        // This prevents the script from stalling out.

        checkFriendStatus();

        setTimeout(pollFriendStatus,pollDelay);

    }

    function checkFriendStatus() {

        console.log("Checking friend status.");

        // check if friends list is visible, otherwise it might not get updates

        var friendsList = document.getElementById("sb-friends-icon");

        if (! friendsList.classList.contains("sb-toolbar-icons__item--selected")) {

            document.getElementById("sb-friends-dropdown-toggle").click();

        }

        var friendsOnline = document.getElementsByClassName("sb-friends__list")[0].getElementsByClassName("sb-online-friends-section")[0].getElementsByClassName("sb-user-tile__online-id");
        var friendsActivity = document.getElementsByClassName("sb-friends__list")[0].getElementsByClassName("sb-online-friends-section")[0].getElementsByClassName("sb-user-tile__current-activity");
        var friendsOffline = document.getElementsByClassName("sb-friends__list")[0].getElementsByClassName("sb-offline-friends-section")[0].getElementsByClassName("sb-user-tile__online-id");

        var friends = [];
        var status = "online";
        var defaultActivity = "none";
        var activity = defaultActivity;
        var user = "";
        var i = 0;

        // Just in case the activity array and friend array don't match (mid update?) we check... If the don't, let's skip it this round
        if (friendsOnline.length != friendsActivity.length) {
            console.log("Skipping.");
            return; // skip this update
        }

        for (i = 0; i < friendsOnline.length; i++) {

            user = friendsOnline[i].innerHTML;
            var currentActivity = friendsActivity[i].innerHTML || "";

            if (currentActivity.length > 0) {

                activity = currentActivity;

            } else {

                activity = defaultActivity;

            }

            friends[friends.length]=({ "user" : user, "status" : status, "activity" : activity });

        }

        status = "offline";

        for (i = 0; i < friendsOffline.length; i++) {

            user = friendsOffline[i].innerHTML;
            activity = defaultActivity;

            friends[friends.length]=({ "user" : user, "status" : status, "activity" : activity});

        }

        friends.forEach(function(friend, index) {

            var friendExists = psnFriends.filter(function(p) {
                return friend.user == p.onlineId

            });

            if (friendExists.length == 0) {

                var newFriend = psnFriends.length;
                psnFriends[newFriend]={};
                psnFriends[newFriend].onlineId = friend.user;
                psnFriends[newFriend].name = friend.user;
                psnFriends[newFriend].status = "unknown";
                psnFriends[newFriend].game = "none";

            }
        });


        psnFriends.sort(function(a,b) {return (a.onlineId > b.onlineId) ? 1 : ((b.onlineId > a.onlineId) ? -1 : 0);});

        var PSN = "PSN";

        var activities = { notify: false }; // the activities queue, used to keep track of who is doing what, and what changed since last time.

        activitiesEntry(activities, PSN,0); // create an entry for PSN, it gets priority 0 (games are priority 1)

        var feedData = friends;

        // loop for each friend

        psnFriends.forEach(function(friend, index) {

            var matchingData = feedData.filter(function(p) {
                return friend.onlineId == p.user;
            });

            if (matchingData.length == 1) {

                var status = matchingData[0];

                var currentStatus = status.status;
                var currentGame = "none";

                // if player is online, get the current game if it's defined

                if (currentStatus=="online") {

                    currentGame = status.activity;

                }

                // if player status has changed (and it wasn't unknown i.e. first time we check) consider it an add/drop,
                // which will cause notification

                if ((friend.status!="unknown") && (friend.status!=currentStatus)) {

                    // console.log(timestampString()+" | PSN status change for "+friend.name+" from "+friend.status+" to "+currentStatus+".");

                    if(currentStatus==="online") {

                        activities[PSN].add.push(friend.name);

                    } else {

                        activities[PSN].drop.push(friend.name);

                    }

                    activities.notify = true;

                } else {

                    // status did not change.

                    // console.log(timestampString()+" | PSN status for "+friend.name+" remains "+currentStatus+".");

                    if(currentStatus==='online') {

                        activities[PSN].current.push(friend.name);

                    }

                }

                friend.status=currentStatus; // store the status on the friend object

                // if the friend is now playing a different game...
                if (friend.game!=currentGame) {

                    // if he was playing a different game before (instead of nothing) consider it a drop from that prior game.
                    if(friend.game!='none') {

                        activitiesEntry(activities, friend.game);
                        activities[gameKey(friend.game)].drop.push(friend.name);
                        activities.notify = true;

                    }

                    // if he is now playing a game (instead of nothing) consider it an add to the current game.
                    if(currentGame!='none') {

                        activitiesEntry(activities, currentGame);
                        activities[gameKey(currentGame)].add.push(friend.name);
                        activities.notify = true;

                    }

                    // console.log(timestampString()+" | Friend "+friend.name+" went from playing "+friend.game+" to playing "+currentGame+".");

                } else {

                    // game title didn't change, but we only care if it's not "none".

                    if (currentGame!='none') {

                        activitiesEntry(activities, currentGame);
                        activities[gameKey(currentGame)].current.push(friend.name);
                        // console.log(timestampString()+" | Friend "+friend.name+" continues playing "+friend.game+".");

                    }

                }

                // store the game on the friend object
                friend.game=currentGame;

            }


        });

        GM.setValue("slack-psn-activity_friends",psnFriends);

        // Now check if we need notification
        // we only notify on an add/drop event.

        if(activities.notify || forceNotify) {

            forceNotify = false;

            // convert the activity list to a sorted array

            var activitiesArray = [];

            for (var key in activities) {

                // we want to skip over the notify property, so we check for "name" property in the value for each key...

                if (activities.hasOwnProperty(key)) {

                    if(typeof activities[key].name!="undefined") {

                        // This is a real activity! Let's sort the add/drop/current players while we are here,
                        // and then add it to the activitiesArray.

                        activities[key].add.sort();
                        activities[key].drop.sort();
                        activities[key].current.sort();
                        activitiesArray.push(activities[key]);

                    }

                }

            }

            activitiesArray.sort(activityCompare);

            // console.log(JSON.stringify(activitiesArray, null,2));

            // produce the notification based on the activitiesArray!
            // slackMessage(s.slack, "Test for multi-line\nMulti-line works!\nHurray!", "#slack-dev");

            var notifyLines = activityNotification(activitiesArray);

            // console.log(JSON.stringify(notifyLines, null,2));

            if (notifyLines.length>0) {

                var notifyMsg = "";

                for (var ndx=0; ndx < notifyLines.length; ndx++) {

                    notifyMsg = notifyMsg + notifyLines[ndx];

                    if (ndx < notifyLines.length) {
                        notifyMsg = notifyMsg + "\n";
                    }

                }

                // to avoid duplicate notifications across page refresh/reloads...

                if (notifyMsg != lastMsg) {

                    lastMsg = notifyMsg;
                    GM.setValue("slack-psn-activity_lastmsg", notifyMsg);
                    slackMessage(notifyMsg);

                }

            }

        }


        // returns a new activity object
        //
        // activity objects are either games or just being on PSN

        function activityEntry(name, priority) {

            var activity = {
                name: name,
                priority: priority,
                add: [],
                drop: [],
                current: []
            };

            return activity;

        }


        // ensures an activity is in the activity queue, and generates a consistent key for games.
        function activitiesEntry(activities, name, priority) {

            priority = typeof priority !=='undefined' ? priority : 1;

            if (priority===1) {
                key = gameKey(name);
            } else {
                key = name;
            }

            if (key in activities) {
                return;
            } else {
                activities[key]=activityEntry(name,priority);
            }

        }


        // used to sort array of activities by priority/name
        // Use activityList.sort(activityCompare);
        function activityCompare(a,b) {

            if ( a.priority === b.priority) {

                if ( a.name < b.name ) {

                    return -1;

                } else {

                    if ( a.name > b.name ) {

                        return 1;

                    } else {

                        return 0;

                    }

                }

            } else {

                if ( a.priority > b.priortity ) {

                    return 1;

                } else {

                    return -1;

                }
            }
        }


        // generates the string used as a key to identify a game (vs PSN activity)
        function gameKey(game) {

            return "game: "+game;

        }


        // convenience formatter for notifications
        // returns "with x, y and z." or "."

        function whoWith(list) {

            if(list.length>0) {

                return " with "+prettyList(list)+".";

            } else {

                return ".";

            }

        }


        // convenience formatters for notifications
        // returns an emoji to flag game vs. psn add/join activity

        function iconGet(priority,isAdd) {

            var icon = ":psnactivity:";

            if (priority===0) {

                if(arguments.length>1) {
                    if(isAdd) {
                        icon = ":psnjoin:";
                    } else {
                        icon = ":psnleave:";
                    }
                } else {
                    icon = ":psn:";
                }
            }

            return icon;

        }


        // convenience formatter for notifications
        //
        // given a list of N strings, it adds commas and " and " when needed, based on the number
        // of elements
        //
        // ex: ("A","B","C")     => "A, B and C"
        //     ("A","B")         => "A and B"
        //     ("A","B","C","D") => "A, B, C and D"
        //     ()                => "nobody"

        function prettyList(list, singularSuffix, pluralSuffix) {

            var output = "";
            var isPlural = !(list.length===1);
            var delimiter = ", ";
            var item = 1;
            var items = list.length;

            singularSuffix = typeof singularSuffix !=='undefined' ? singularSuffix : "";
            pluralSuffix = typeof pluralSuffix !=='undefined' ? pluralSuffix : "";

            for (var ndx=0; ndx < list.length; ndx++) {

                output = output + list[ndx];

                if (item<items) {

                    if(item===(items-1)) {
                        delimiter = " and ";
                    }

                    output = output + delimiter;
                }

                item++;

            }

            if (items>0) {
                if (isPlural) {
                    if(pluralSuffix!="") {
                        output = output + " "+ pluralSuffix;
                    }
                } else {
                    if(singularSuffix!="") {
                        output = output + " "+singularSuffix;
                    }
                }
            }

            if (items==0) {
                output = "nobody";
            }

            return output;

        }





        // this produces the "report" array that's used for notifications based on the activity array
        //
        // The activity array contains what is going on right now
        // This function turns that into a format used to create the notification

        function activityNotification(activitiesArray) {

            var notifyLines = [];
            var gamingPlayers = {};

            var psnActivity = activitiesArray.filter(function(obj) { return obj.priority==0 })[0];
            var gamingActivity = activitiesArray.filter(function(obj) { return obj.priority!=0 });
            var activePlayers = [];
            var notifyLine = "";

            for (var i=0; i<activitiesArray.length; i++) {

                activity = activitiesArray[i];

                if (activity.priority > 0) {

                    notifyLines.push(":video_game: "+activity.name+":");

                    notifyLine = "> ";

                    if (activity.add.length>0) {
                        notifyLine = notifyLine + " :eight_spoked_asterisk: Starting: "+prettyList(activity.add)+".";
                        activePlayers = activePlayers.concat(activity.add);
                    }

                    if (activity.current.length>0) {
                        notifyLine = notifyLine +" Playing: "+prettyList(activity.current.concat(activity.add))+".";
                        activePlayers = activePlayers.concat(activity.current);
                    }

                    if (activity.drop.length>0) {
                        notifyLine = notifyLine + " :anger: Stopping: "+prettyList(activity.drop)+".";
                    }

                    notifyLines.push(notifyLine);

                }

            }

            // Now cull active players from the PSN activity. We only want to report add and current PSN activity for players NOT gaming.
            // we always report drops, though.

            psnActivity.add = psnActivity.add.filter(function(i) { return activePlayers.indexOf(i)<0;});
            psnActivity.current = psnActivity.current.filter(function(i) { return activePlayers.indexOf(i)<0;});

            if (psnActivity.add.length+psnActivity.current.length+psnActivity.drop.length>0) {

                notifyLines.push(":tv: PSN:")

                notifyLine = "> ";

                if (psnActivity.add.length>0) {
                    notifyLine = notifyLine + " :eight_spoked_asterisk: Joining: "+prettyList(psnActivity.add)+".";
                }

                if (psnActivity.current.length>0) {
                    notifyLine = notifyLine +" Online: "+prettyList(psnActivity.current.concat(psnActivity.add))+".";
                }

                if (psnActivity.drop.length>0) {
                    notifyLine = notifyLine + " :anger: Leaving: "+prettyList(psnActivity.drop)+".";
                }

                notifyLines.push(notifyLine);

            }

            return(notifyLines);

        }

        var currently = new Date();

        if ((currently - lastRefresh) > refreshPeriod) {

            location.reload();

        }

    }


    // timestamp for console logging
    function timestampString() {

        return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    }


    function configSlackHook() {

        var newHook = prompt("Enter Slack webhook for notifications:",slackHook);

        if (newHook) {

            if (newHook.slice(0,33) == "https://hooks.slack.com/services/") {
                slackHook=newHook;
                GM.setValue("slack-psn-activity_hook",slackHook);
            } else {
                window.alert("That is not a valid Slack webhook URL.");
            }

        }
    }


    // Send a message to slack

    function slackMessage(msg) {

        if (slackHook) {

            console.log(timestampString()+" | Sending Slack notification.");
            console.log(msg);

            GM.xmlHttpRequest({
                method: "POST",
                url: slackHook,
                data: '{"text": "'+msg+'"}',
                headers: {
                    "Content-Type": "application/json"
                },
                onload: function(response) {

                    console.log("Post response:");
                    console.log(response);

                }

            });

        } else {

            console.log("Slack hook URL is not valid. No notification sent.");

        }

    }


    function setFriendRealNames() {

        for (var i=0; i< psnFriends.length; i++) {

            var newName = prompt("Name for PSN user \""+psnFriends[i].onlineId+"\"?",psnFriends[i].name);

            if (newName) {
                psnFriends[i].name=newName;
            } else {
                break;
            }

        }

    }


    function saySomething() {
        var whatToSay = prompt("What should I send to Slack?","");

        if (whatToSay) {

            slackMessage(whatToSay);

        }

    }

    function forceNotice() {

        forceNotify = true;
        console.log("Notification will occur with next polling regardless of change.");

    }

})();