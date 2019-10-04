# Guide to Use

The JSON objects and tests described in this directory are intended to be used to inform basic sanity-checking and unit tests. They are intended to check only that the output produced from given inputs yields formally-correct results: that is to say, if these tests pass, users can have confidence that objects produced by these classes will be parseable by conformant consuming applications. 

Validation of values (that is to say, whether the data which populates the resulting objects is correct and meaningful) is a separate issue, outside the scope of these tests.

An illustration of the general testing approach can be found in the .[NET model tests](https://github.com/openactive/OpenActive.NET/blob/master/OpenActive.NET.Test/EventTest.cs):


1. A hand-crafted JSON OpenActive object is provided for reference.
2. A constructor is called, using arguments taken from the hand-crafted object, with the intention that the constructor replicates this object exactly.
3. A variety of tests are then run to ensure that the object created by the constructor and the original JSON object are indeed functionally identical.
