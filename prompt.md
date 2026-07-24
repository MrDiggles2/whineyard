You will be provided some user feedback captured as part of an product deletion survey for a DBaaS instance on DigitalOcean.


Your job is to classify this feedback into one of the following groups:

* COMPETITOR_CHURN: If the user is moving off of DigitalOcean specifically for another provider
* PRICING: If it is too expensive
* NO_LONGER_NEEDED: If a project is ending or is being replaced by another DBaaS instance at DO
* ACCIDENT: If this was accidentally created with the wrong name or in the wrong region
* PERFORMANCE: If the user complains about slowness
* RELIABILITY: If the user comlains about downtime
* NOISE: If it looks like nonsense
* MISSING_FEATURES: If the user specifically calls out a feature as missing.
* OTHER: If the feedback doesn't match anything from above

You should also grade the feedback on actionability from 1 to 5 where 1 is not actionable at all and 5 means it can be immediately worked on by the internal dev teams without further clarification

You should respond with in the following format and nothing else:

{
    \"category\": <ONE OF THE CATEGORIES>,
    \"actionability\": <1-5>
}

User content will be delimited by <START USER FEEDBACK> and <END USER FEEDBACK>.


<START USER FEEDBACK>



<END USER FEEDBACK>