

# Data Structure Rules


# JSON Objects


## Order Example
```
{
	"@context": "https://openactive.io/",
	"type": "Order",
	"id": "https://openactive.example.com/Orders/12345",
	"orderedItem": [{
		"type": "OrderItem",
		"id": "https://fencing-book/item/12345",
		"orderItemStatus": "https://openactive.io/OrderConfirmed",
		"unitTaxSpecification": [{
			"type": "TaxChargeSpecification",
			"name": "VAT at 20%",
			"price": 1.00,
			"priceCurrency": "GBP",
			"rate": 0.2
		}],
		"orderedItem": {
			"type": "ScheduledSession",
			"id": "https://pimlico-fencing-club.example.com/intermediate/12345",
			"url": "https://pimlico-fencing-club.example.com/intermediate-classes/juniors",
			"activity": [{
				"type": "Concept",
				"prefLabel": "Fencing",
				"id": "https://openactive.io/activity-list#_92808e60-820c-4ee2-89ec-ea8d99d3f528"
			}],
			"ageRange": {
				"type": "QuantitativeValue",
				"minValue": 11,
				"maxValue": 17
			},
			"name": "Fencing Fridays! Junior class.",
			"startDate": "2019-10-04T19:00:00Z",
			"endDate": "2019-10-04T20:30:00Z",
			"duration": "PT90M",
			"location": {
				"type": "Place",
				"name": "Pimlico Fencing Club Suite",
				"address": {
					"type": "PostalAddress",
					"addressCountry": "GB",
					"addressRegion": "London",
					"addressLocality": "Pimlico",
					"postalCode": "SW55 P23",
					"streetAddress": "12345 Sports Suites, Pimlico Road, Pimlico"
				}
			},
			"organizer": {
				"type": "Organization",
				"name": "Pimlico Fencing Club"
			}
		},
		"acceptedOffer": {
			"type": "Offer",
			"id": "https://pimlico-fencing-club.example.com/junior-regular/12345",
			"price": 6.00,
			"priceCurrency": "GBP",
			"availableChannel": [
				"https://openactive.io/OpenBookingPrepayment",
				"https://openactive.io/OnlinePrepayment"
			]
		}
	}],
	"seller": {
		"type": "Organization",
		"name": "Pimlico Fencing Club",
		"legalName": "Pimlico Fencing Club (PFC)",
		"taxMode": "https://openactive/TaxGross",
		"vatID": "12345",
		"address": {
			"type": "PostalAddress",
			"addressCountry": "GB",
			"addressRegion": "London",
			"addressLocality": "Pimlico",
			"postalCode": "SW55 P23",
			"streetAddress": "12345 Sports Suites, Pimlico Road, Pimlico"
		}
	},
	"broker": {
		"type": "Organization",
		"name": "Fencing Booking Partners"
	},
	"brokerRole": "https://openactive/AgentBroker",
	"customer": {
		"type": "Person",
		"name": "Errol Flynn",
		"email": "swordz@sabres.org"
	},
	"taxCalculationExcluded": false,
	"bookingService": {
		"type": "BookingService",
		"name": "Fencing EZ App"
	},
	"totalPaymentDue": {
		"type": "PriceSpecification",
		"price": 6.00,
		"priceCurrency": "GBP"
	},
	"totalPaymentTax": [{
		"type": "TaxChargeSpecification",
		"name": "VAT at 20%",
		"price": 1.00,
		"priceCurrency": "GBP",
		"rate": 0.2
	}],
	"orderProposalVersion": "https://pimlico-fencing-club/orders/confirmed/12345"
}
```

## Slots Example
```
{
  "@context": "https://openactive.io/",
  "type": "FacilityUse",
  "url": "http://www.example.org/facility-use/1",
  "name": "Example Leisure Centre Table Tennis",
  "description": "Table tennis tables are available to hire for thirty minute slots",
  "activity": [
    {
      "type": "Concept",
      "prefLabel": "Table Tennis",
      "id": "https://openactive.io/activity-list#1a05993d-b206-4efe-85da-646fa340bdf4"
    }
  ],
  "provider": {
    "type": "Organization",
    "name": "Leisure Centre Ltd"
  },
  "location": {
    "type": "Place",
    "name": "Example Leisure Centre",
    "address": {
      "type": "PostalAddress",
      "streetAddress": "1 High Street",
      "addressLocality": "Bristol",
      "addressRegion": "Somerset",
      "postalCode": "BS1 4SD",
      "addressCountry": "GB"
    }
  },
  "event": [
    {
      "type": "Slot",
      "id": "http://www.example.org/facility-use/slots/1",
      "facilityUse": "http://www.example.org/facility-use/1",
      "startDate": "2018-03-01T10:00:00Z",
      "duration": "PT30M",
      "remainingUses": 1,
      "maximumUses": 4,
      "offers": [
        {
          "type": "Offer",
          "name": "30 minute hire",
          "price": 10,
          "priceCurrency": "GBP"
        }
      ]
    },
    {
      "type": "Slot",
      "id": "http://www.example.org/facility-use/slots/2",
      "facilityUse": "http://www.example.org/facility-use/1",
      "startDate": "2018-03-01T10:30:00Z",
      "duration": "PT30M",
      "remainingUses": 3,
      "maximumUses": 4,
      "offers": [
        {
          "type": "Offer",
          "name": "30 minute hire",
          "price": 10,
          "priceCurrency": "GBP"
        }
      ]
    }
  ]
}
```

## Event example
```
{
  "@context": "https://openactive.io/",
  "type": "Event",
  "url": "http://www.example.org/events/1",
  "name": "Tai chi Class",
  "activity": [
    {
      "type": "Concept",
      "prefLabel": "Tai Chi",
      "id": "https://openactive.io/activity-list#c16df6ed-a4a0-4275-a8c3-1c8cff56856f"
    }
  ],
  "description": "A tai chi class intended for beginners",
  "attendeeInstructions": "Please wear trainers and comfortable clothing",
  "startDate": "2017-03-22T20:00:00Z",
  "duration": "PT60M",
  "organizer": {
    "type": "Organization",
    "url": "http://example.org/orgs/bristol-tai-chi",
    "name": "Bristol Tai Chi"
  },
  "location": {
    "type": "Place",
    "name": "ExampleCo Gym",
    "address": {
      "type": "PostalAddress",
      "streetAddress": "1 High Street",
      "addressLocality": "Bristol",
      "addressCountry": "GB",
      "addressRegion": "Somerset",
      "postalCode": "BS1 4SD"
    }
  },
  "offers": [
    {
      "type": "Offer",
      "identifier": "OX-AD",
      "name": "Adult",
      "price": 3.3,
      "priceCurrency": "GBP",
      "url": "https://profile.everyoneactive.com/booking?Site=0140&Activities=1402CBP20150217&Culture=en-GB"
    }
  ]
}
```

# Tests

**Correctness of global structure**

*   Object is single, not array

**JSON-LD is fully parseable**



*   @context attribute is present and includes at a minimum value  "https://openactive.io/"
*   If beta properties are included, @context is an array and also includes the value "https://openactive.io/ns-beta"

**Structure is correct**

_SessionSeries example_

*   Order.orderedItem.orderedItem exists
*   Order.orderedItem.acceptedOffer exists
*   Order.orderedItem.unitTaxSpecification exists and is Array
*   Order has no properties beyond
    *   type
    *   id
    *   orderedItem
    *   seller
    *   broker
    *   brokerRole
    *   customer
    *   taxCalculationExcluded
    *   bookingService
    *   totalPaymentDue

_Slots example_

*   FacilityUse.event exists and is array
*   FacilityUse has no properties beyond
    *     type
    *     url
    *     name
    *     description
    *     activity
    *     provider
    *     location
    *     offers
    *     event

_Event example_

*   Event.attendeeInstructions exists
*   Event has no properties beyond
    *   type
    *   url
    *   name
    *   activity
    *   description
    *   attendeeInstructions
    *   startDate
    *   duration
    *   organizer
    *   location
