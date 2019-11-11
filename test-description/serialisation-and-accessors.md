

# Serialisation and Accessor Tests

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
