/*-------------------------------------------------------------------------------
# Copyright IBM Corp. 2018
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#-------------------------------------------------------------------------------*/
var express = require('express');
var request = require('request');
var methodOverride = require('method-override');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var unirest = require('unirest');
var session = require('express-session');

var app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(morgan('dev'));

/* ----------------------------------------------------------------------------------------- */
/* Get the env variables                                                                     */
/* ----------------------------------------------------------------------------------------- */
const endpoint = process.env.ENDPOINT_URL;
if (endpoint == undefined)
{
  console.error('\x1b[31mERROR: %s\x1b[0m',"No endpoint for wether backend interaction is defined.")
  console.error('\x1b[31mERROR: %s\x1b[0m',"Define a correct env variable for weather backend.")
  process.exit(1);
}
var port = process.env.SERVER_PORT;
if (port  == undefined)
{
  port = 3000;
}
else if (isNaN(port))
{
  console.error('\x1b[31mERROR: %s\x1b[0m',"the SERVER_PORT is not a number.")
  console.error('\x1b[31mERROR: %s\x1b[0m',"Define a numeric SERVER_PORT variable.")
  process.exit(2);
}

/* ----------------------------------------------------------------------------------------- */
/* launch the server                                                                         */
/* ----------------------------------------------------------------------------------------- */
var server = app.listen(port, function() {
  console.log('***********************************');
  console.log('listening:', port);
  console.log('***********************************');
  console.log('Weather endpoint is :%s',endpoint)
});

module.exports = server;
/* ----------------------------------------------------------------------------------------- */
/* Functions                                                                                 */
/* ----------------------------------------------------------------------------------------- */
function getTarget(inputType,input,country,callback)
{
  var targetURL="";
  if(inputType=="name")
  {
    targetURL = endpoint+"/api/weather/v3/location/search?query="+input+"&locationType=city&countryCode="+country+"&language=en-US";
  }
  else if (inputType=="geocode")
  {
    targetURL = endpoint+"/api/weather/v3/location/point?geocode="+input+"&language=en-US";
  }
  else
  {
    targetURL = endpoint+"/api/weather/v3/location/point?postalKey="+input+"%3A"+country+"&language=en-US";
  }
  callback(targetURL);
}

function getLocInfo(inputType, input, country, callback)
{
  getTarget(inputType, input, country,function(target)
  {
    console.log("backend call :%s",target);
    unirest.get(target)
          .header("content-type", "application/x-www-form-urlencoded;charset=utf-8")
          .header("accept", "application/json;charset=utf-8")
          .end(function(result)
            {
              if (result.code=="200")
              {
                location = result.body.location;
                if ((!location.address) || (location.address.length==1))
                {
                  callback({resultType: "position", longitude: location.longitude, latitude: location.latitude,city: location.city, district: location.adminDistrict, country: location.country})
                }
                else
                {
                  townList = [];
                  for(j=0;j<location.address.length;j++)
                  {
                    town = {};
                    town.name = location.address[j];
                    town.longitude = location.longitude[j];
                    town.latitude = location.latitude[j];
                    townList[j]=town;
                  }
                  callback({resultType: "listeTown",result: townList});
                }
              }
              else
              {
                console.log(result.body);
                console.log("error in the localization call");
                callback({resultType:"error", error_msg:" Error during the identification of target town, check your input and retry"})
              }
            }
          );
    }
  );
}

function getForecast(position,callback)
{
  var targetURL = endpoint+"/api/weather/v1/geocode/"+position+"/forecast/daily/10day.json?units=m&language=en-US";
  console.log("backend call :%s",targetURL);
  unirest.get(targetURL)
         .header("content-type", "application/x-www-form-urlencoded;charset=utf-8")
         .header("accept", "application/json;charset=utf-8")
         .end(function(result)
            {
              callback(result.body);
            }
          );
}

/* ----------------------------------------------------------------------------------------- */
/* Manage the homepage of the application -------------------------------------------------- */
/* ----------------------------------------------------------------------------------------- */
app.get('/', function(req, res)
     {
       res.render('index',{townTarget: "", locInfo: ""});
      }
    );
app.post('/weather', function(req, res)
     {
       console.log("weather request")
       getLocInfo(req.body.type, req.body.input,req.body.country, function(resultLoc)
       {
         if (resultLoc.resultType == "position")
         {
           position = resultLoc.latitude + "/" + resultLoc.longitude
           townTarget=resultLoc.city+", "+resultLoc.district+", "+resultLoc.country
           getForecast(position, function(resultForecast)
           {
             forecast = resultForecast.forecasts;
             myforecast = [];
             for (i=0; i<forecast.length; i++)
             {
               day = forecast[i].dow;
               if(forecast[i].day)
               {
                 day_shortcast = forecast[i].day.shortcast;
                 day_icon= forecast[i].day.icon_code;
               }
               else
               {
                 day_shortcast= undefined;
                 day_icon= undefined;
               }
               if(forecast[i].night)
               {
                 night_shortcast = forecast[i].night.shortcast;
                 night_icon= forecast[i].night.icon_code;
               }
               else
               {
                 night_shortcast=undefined;
                 ight_icon=undefined;
               }
               max_temp = forecast[i].max_temp;
               min_temp = forecast[i].min_temp;

               fc = {day, day_shortcast, night_shortcast,day_icon,night_icon,max_temp,min_temp};
               myforecast[i]=fc;
             }
             res.render('index',{target: townTarget, locInfo: myforecast});
           }
         );
         }
         else if (resultLoc.resultType=="listeTown")
         {
           res.render('townselect',{locInfo: resultLoc.result});
         }
         else if (resultLoc.resultType=="error")
         {
           res.render('error',{error_msg: resultLoc.error_msg});
         }
         else
            res.render('index',{townTarget: "",locInfo: ""});
      }
      );
    }
);

app.use(function (req, res, next) {
  res.status(404).render('index',{townTarget: "", locInfo: ""});
});
