
# Datatyping


# JSON Objects


## SessionSeries example

```
{

   "@context": "https://openactive.io/",

   "type":"Order",

   "id":"https://openactive.example.com/Orders/12345",

   "orderedItem":[

      {

         "type":"OrderItem",

         "id":"https://fencing-book/item/12345",

         "orderItemStatus":"https://openactive.io/OrderConfirmed",

         "unitTaxSpecification":[

            {

               "type":"TaxChargeSpecification",

               "name":"VAT at 20%",

               "price":1.00,

               "priceCurrency":"GBP",

               "rate":0.2

            }

         ],

         "orderedItem":{

            "type":"ScheduledSession",

            "id":"https://pimlico-fencing-club.example.com/intermediate/12345",

            "url":"https://pimlico-fencing-club.example.com/intermediate-classes/juniors",

            "activity":{

               "type":"Concept",

               "prefLabel":"Fencing",

               "id":"https://activity-list-editor.openactive.io/_92808e60-820c-4ee2-89ec-ea8d99d3f528"

            },

   	"ageRange":{

      	    "minValue":11,

      	    "maxValue":17

   	},

            "name":"Fencing Fridays! Junior class.",

            "startDate":"2019-10-04T19:00:00Z",

            "endDate":"2019-10-04T20:30:00Z",

            "duration":"PT90M",

            "location":{

               "type":"Place",

               "name":"Pimlico Fencing Club Suite"

            },

            "organizer":[

               {

                  "type":"Organization",

                  "name":"Pimlico Fencing Club"

               }

            ]

         },

         "acceptedOffer":{

            "type":"Offer",

            "id":"https://pimlico-fencing-club.example.com/junior-regular/12345",

            "price":6.00,

            "priceCurrency":"GBP",

            "availableChannel":[

               "https://openactive.io/OpenBookingPrepayment",

               "https://openactive.io/OnlinePrepayment"

            ]

         }

      }

   ],

   "seller":{

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

   "broker":{

      "type":"Organization",

      "schema":"Fencing Booking Partners"

   },

   "brokerRole":"https://openactive/AgentBroker",

   "customer":{

      "type":"Person",

      "name":"Errol Flynn",

      "email":"swordz@sabres.org"

   },

   "taxCalculationExcluded":false,

   "bookingService":{

      "type":"BookingService",

      "name":"Fencing EZ App"

   },

   "totalPaymentDue":{

      "type":"PriceSpecification",

      "price":6.00,

      "priceCurrency":"GBP"

   },

   "totalPaymentTax":[

      {

         "type":"TaxChargeSpecification",

         "name":"VAT at 20%",

         "price":1.00,

         "priceCurrency":"GBP",

         "rate":0.2

      }

   ],

   "orderProposalVersion":"https://pimlico-fencing-club/orders/confirmed/12345"

}
```

## Slots example

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

# Tests

**“type” property is present and populated correctly**

_SessionSeries example_

*   Type of top-level object is “Order”
*   Type of Order.orderedItem[0].orderedItem is “ScheduledSession”
*   Type of Order.orderedItem[0].acceptedOffer is “Offer”
*   Type of Order.orderedItem[0].acceptedOffer.activity is “Concept”

_Slots example_

*   Type of FacilityUse.event[0] is “Slot”
*   Type of FacilityUse.location.address is “PostalAddress”

**Null values are absent**

*   no null values are found in output, even when explicitly supplied in input

**Empty strings are absent**

*   no empty strings are found in the output, even when explicitly supplied in input

**Empty arrays are absent**

*   no empty arrays are found in the output, even when explicitly supplied in input

**Simple datatypes are correct**

_SessionSeries example_



*   Order.orderedItem.unitTaxSpecification.price is a Float
*   Order.orderedItem.orderedItem.name is a String

_Slots example_



*   FacilityUse.event[1].remainingUses is an Integer
*   FacilityUse.event[1].maximumUses is an Integer

**Complex datatypes are correct**

_SessionSeries example_



*   “activity” is can be cast to a Concept
*   “seller” can be cast to an Organization
*   “bookingService” can be cast to a BookingService
*   “orderItem” can be cast to an OrderItem

_Slots example_



*   “offer” can be cast to an Offer
