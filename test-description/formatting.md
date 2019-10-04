

# Formatting


# JSON Object

            

{

  “@context”: "https://openactive.io/", 

   "type":"SessionSeries",

   "id":"https://pimlico-fencing-club/intermediate-classes/juniors/fencing-fridays",

   "url":"https://pimlico-fencing-club/intermediate-classes/juniors/fencing-fridays#about",

   "name":"Fencing Fridays! Junior class",

   "startDate":"2019-09-06",

   "endDate":"2020-08-31",

   "duration":"PT90M",

   "activity":{

      "type":"Concept",

      "prefLabel":"Fencing",

      "id":"https://activity-list-editor.openactive.io/_92808e60-820c-4ee2-89ec-ea8d99d3f528"

   },

   "location":{

      "type":"Place",

      "name":"Pimlico Fencing Club Suite"

   },

   "organizer":{

      "type":"Organization",

      "name":"Pimlico Fencing Club",

      "legalName":"Pimlico Fencing Club (PFC)",

      "taxMode":"https://openactive/TaxGross",

      "vatID":"12345",

      "address":{

         "addressCountry":"United Kingdom",

         "addressLocality":"Pimlico",

         "postalCode":"SW55 P23",

         "streetAddress":"12345 Sports Suites, Pimlico Road, Pimlico"

      }

   },

   "ageRange":{

      "minValue":11,

      "maxValue":17

   },

   "subEvent":{

      "type":"ScheduledSession",

      "id":"https://pimlico-fencing-club.example.com/intermediate/12345",

      "url":"https://pimlico-fencing-club.example.com/intermediate-classes/juniors",

      "name":"Fencing Fridays! Junior class - First Friday in October",

      "startDate":"2019-10-04T19:00:00Z",

      "endDate":"2019-10-04T20:30:00Z",

      "offers": [{

         "type":"Offer",

         "id":"https://pimlico-fencing-club.example.com/junior-regular/12345",

         "price":6,

         "priceCurrency":"GBP",

         "availableChannel":[

            "https://openactive.io/OpenBookingPrepayment",

            "https://openactive.io/OnlinePrepayment"

         ]

      }]

   }

}


# Tests

**Date and time in correct format**



*   SessionSeries.subEvent.startDate in correct ISO-8601 format
*   SessionSeries.subEvent.endDate in correct ISO-8601 format
*   SessionSeries.duration
    *   Matches subEvent.startDate and subEvent.endDate difference
    *   In correct ISO-8601 format

**URLs**



*   SessionSeries.id, SessionSeries.activity, and SessionSeries.subEvent.url are both correctly-formatted URLs


