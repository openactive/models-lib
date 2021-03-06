## Event with extension example

```
{
  "@context": [
    "https://openactive.io/",
    "http://data.letsride.co.uk/opendata/britishcycling.jsonld"
  ],
  "type": "Event",
  "id": "https://openactive.example.com/Orders/12345",
  "alternateName": "Schema.org property",
  "acmecorp:newPropString": "Extension property",
  "acmecorp:newPropInt": 1,
  "acmecorp:newPropDecimal": 2.2,
  "acmecorp:newPropClass": {
    "type": "Place",
    "name": "Happy"
  }
}
```

Construct the above using model, and assert that, both in JSON output (serialisation) and in class output (deserialisation):
- "acmecorp:newPropString" is set to value "Extension property"
- "acmecorp:newPropInt" is set to value 1
- "acmecorp:newPropDecimal" is set to value 2.2
- "acmecorp:newPropClass" is set to a "Place" class with "name" set to "Happy"
- "alternateName" is set to "Schema.org property"
- Price is rendered as "0" not "0.0"
- @context = [ "https://openactive.io/", "http://data.letsride.co.uk/opendata/britishcycling.jsonld" ]



## Event with beta example

```
{
  "@context": [
    "https://openactive.io/",
    "https://openactive.io/ns-beta"
  ],
  "type": "Event",
  "id": "https://openactive.example.com/Orders/12345",
  "beta:formattedDescription": "Beta event",
  "beta:facilitySetting": "https://openactive.io/ns-beta#IndoorFacility",
  "beta:attendeeCount": 0,
  "alternateName": "Schema.org property",
  "offers": [
    {
      "type": "beta:IndicativeOffer",
      "price": 0,
      "priceCurrency": ""
    }
  ]
}
```

Construct the above using model, and assert that, both in JSON output (serialisation) and in class output (deserialisation):
- "beta:formattedDescription" is set to value "Beta event"
- "beta:attendeeCount" is set to value 0
- "beta:facilitySetting" is set to "https://openactive.io/ns-beta#IndoorFacility"
- First offer is of type "beta:IndicativeOffer"
- Price is rendered as 0 not 0.0
- priceCurrency is not be included in output
- "alternateName" is set to "Schema.org property"
- @context = [ "https://openactive.io/", "https://openactive.io/ns-beta" ]

(Note you will need to rebuild your model to get the updated beta context which now includes the facilitySetting on Event, which was only added recently)


## Event with beta example and extension example

```
{
  "@context": [
    "https://openactive.io/",
    "https://openactive.io/ns-beta",
    "http://data.letsride.co.uk/opendata/britishcycling.jsonld"
  ],
  "type": "Event",
  "id": "https://openactive.example.com/Orders/12345",
  "alternateName": "Schema.org property",
  "acmecorp:newPropString": "Extension property",
  "beta:formattedDescription": "Beta event"
}
```

Construct the above using model, and assert that, both in JSON output (serialisation) and in class output (deserialisation):
- "acmecorp:newPropString" is set to value "Extension property"
- "beta:formattedDescription" is set to value "Beta event"
- @context = [ "https://openactive.io/", "https://openactive.io/ns-beta", "http://data.letsride.co.uk/opendata/britishcycling.jsonld" ]

