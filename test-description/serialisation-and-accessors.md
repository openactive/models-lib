

# Serialisation and Accessors


# JSON Objects


## SessionSeries Example
```
{

  "@context": "https://openactive.io/",

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

      "offers":[

         {

            "type":"Offer",

            "id":"https://pimlico-fencing-club.example.com/junior-regular/12345",

            "price":6.00,

            "priceCurrency":"GBP",

            "availableChannel":[

               "https://openactive.io/OpenBookingPrepayment",

               "https://openactive.io/OnlinePrepayment"

            ]

         }

      ]

   }

}
```

## Slots Example

```

{

   "@context":"https://openactive.io/",

   "type":"FacilityUse",

   "url":"http://www.example.org/facility-use/1",

   "name":"Example Leisure Centre Table Tennis",

   "description":"Table tennis tables are available to hire for thirty minute slots",

   "activity":{

      "type":"Concept",

      "prefLabel":"Table Tennis",

      "id":"https://activity-list-editor.openactive.io/_1a05993d-b206-4efe-85da-646fa340bdf4"

   },

   "provider":{

      "type":"Organization",

      "name":"Leisure Centre Ltd"

   },

   "location":{

      "type":"Place",

      "name":"Example Leisure Centre",

      "address":{

         "type":"PostalAddress",

         "streetAddress":"1 High Street",

         "addressLocality":"Bristol",

         "addressRegion":"Somerset",

         "postalCode":"BS1 4SD",

         "addressCountry":"GB"

      }

   },

   "offers":[

      {

         "type":"Offer",

         "name":"30 minute hire",

         "price":10,

         "priceCurrency":"GBP"

      }

   ],

   "event":[

      {

         "type":"Slot",

         "id":"http://www.example.org/facility-use/slots/1",

         "facilityUse":"http://www.example.org/facility-use/1",

         "startDate":"2018-03-01T10:00:00Z",

         "duration":"PT30M",

         "remainingUses":1,

         "maximumUses":4

      },

      {

         "type":"Slot",

         "id":"http://www.example.org/facility-use/slots/2",

         "facilityUse":"http://www.example.org/facility-use/1",

         "startDate":"2018-03-01T10:30:00Z",

         "duration":"PT30M",

         "remainingUses":3,

         "maximumUses":4

      }

   ]

}
```

## Event example
```
{

   "type":"Event",

   "url":"http://www.example.org/events/1",

   "name":"Tai chi Class",

   "activity”:{

	"type”: "Concept”,

            "prefLabel”: "Tai Chi”,

	"id”:”https://activity-list-editor.openactive.io/_c16df6ed-a4a0-4275-a8c3-1c8cff56856f”

	},

   "description":"A tai chi class intended for beginners",

   "attendeeInstructions":"Please wear trainers and comfortable clothing",

   "startDate":"2017-03-22T20:00:00",

   "duration":"PT60M",

   "organizer":[

      {

         "type":"Organization",

         "url":"http://example.org/orgs/bristol-tai-chi",

         "name":"Bristol Tai Chi"

      }

   ],

   "location":{

      "type":"Place",

      "name":"ExampleCo Gym",

      "address":{

         "type":"PostalAddress",

         "streetAddress":"1 High Street",

         "addressLocality":"Bristol",

         "addressCountry":"GB",

         "addressRegion":"Somerset",

         "postalCode":"BS1 4SD"

      }

   }

}
```

# Tests

**Accessors return values appropriately**


*   _SessionSeries example_
    *   Accessor for SessionSeries.startDate returns correct value
    *   Accessor for SessionSeries.subEvent.name returns correct value
*   _Slots example_
    *   Accessor for FacilityUse.location.name returns correct value
    *   Accessor for FacilityUse.event[0].startDate returns correct value
*   _Event example_
    *   Accessor for Event.location.addressRegion returns correct value

**Object generated and object derived from parsing text above pass equality test**

**Serialisation/Deserialisation retain fidelity**

* Serialising and then deserialising does not alter the data structure of the Activity object

* Serialising and then deserialising does not alter the data structure of the Offer object

* Serialising and then deserialising does not alter the data structure of the Place object
