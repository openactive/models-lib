
# Datatyping

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
