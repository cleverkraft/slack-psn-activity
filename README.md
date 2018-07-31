# slack-psn-activity
This is a [Tampermonkey](https://tampermonkey.net) [userscript](https://en.wikipedia.org/wiki/Userscript) that runs in [Chrome](https://www.google.com/chrome/) to post notifications to [Slack](https://www.slack.com) about [PSN](https://www.playstation.com) activity of friends.

If you are using Slack for a community of PSN gamers, this script can help. Since Sony is ~~too stupid~~ ~~too lazy~~ unable to make a real API for communities to use to get basic information like the online status of their friends, the only option is to pull the information from the Playstation web site. This script does just that.

Because this is a userscript that is injected into the context of the Playstation site, you won't run into painful issues dealing with [Captchas](https://axesslab.com/captchas-suck/) like I did on my first attempts when I used Selenium to scrape the page.

The suggested way for communities to use this script is to create a new, free PSN ID and have your community members friend that account on PSN. Not only does this make everything "opt-in" for the community, it also gets around the problem that the web page doesn't show the online status of the account current being used to log into the web site.

Of course, you'll also need to set up an incoming Slack web hook for your Slack. You can do that at the [Slack API](https://api.slack.com) page. Make an application (I called mine PSNBot) and use the "Add features and functionality" link to create an incoming web hook to a channel. It's suggested to make a specific channel (I called ours "#psn-activity").

Once you've got that all setup, you'll need this script in Chrome which has [Tampermonkey already installed](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo). The script is installed by visiting the [source for the script in this repo](https://github.com/cleverkraft/slack-psn-activity/blob/master/slack-psn-activity.user.js) and then click the "Raw" button. Tampermonkey will pop up an installation page. Click install.

With the script in place, you can now go to the [PSN What's New](https://my.playstation.com/whatsnew) page. You'll need to log into the PSN ID that you want to monitor, of course. The first time the script launches, it will ask for the Slack incoming web hook URL to use to post messages. It will now poll the page every 30 seconds and post to Slack when there are changes. It will also reload the page every eight hours, since I've seen the page stall out after a long time being open.

In my experience, the web page has a very long time before it needs to re-authenticate. So long, in fact, that I'm not even sure when it happens. When I have more experience with this issue, the script will be updated so it will notify (via Slack) when it needs help.

The script has four menu options, available under the Tampermonkey icon when you are on the PSN What's New page:

  * Setup Slack Webhook: allows you to set the web hook URL, done automatically when the script starts for the first time.
  * Set Friends Name: by default, the script will use the PSN ID to identify people. You can opt to use a specified name instead. This will loop through all the PSN IDs and ask for each one what name to use. Cancel will stop.
  * Force Slack Notification: this will post an update to Slack based on what is currently going on. This is in case some weird sequence of events causes the information on Slack to be vast different from what's on the web page. Shouldn't be needed, but the script is still an early beta, so there you go.
  * Send message to Slack: allows you to post an arbitrary message to Slack as your bot user. Useful to inform your community when there's been (ahem) issues with the script.
  
  This script has been tested on Chrome for OS X. It should work on other platforms as well, though on the Raspberry Pi I've had it lock up the whole computer after awhile.
