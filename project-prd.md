
## Description

This project is designed to ingest customer exit feedback, store it in a database, then run the feedback into an inference endpoint to categorize and judge actionability.

We should use DigitalOcean as much as possible.

This project has 4 components:

### Service

Using DigitalOcean's App Platform, create a service that exposes an API that accepts POST request payloads to `<url to api>/feedback/<form-uuid>` in the format

```
{
    "feedback": "Open ended text field",
    "tags": [ "Tags", "Determined", "By", "Clients" ]
}
```

These entries should be stored in a database.

These entries should periodically be polled by a worker that grabs any unscored entries and pushes them to DigitalOcean's batched inference with a scoring prompt. See `../batched-survey` for a POC. The scores, which is category and actionability, should also be recorded in the database.

### Database

A long term persistant store of feedback entries and scores via DO's DBaaS

### Web UI

A simple HTML page with no extra frameworks served by nginx.

This page should provide a view of all the entries and the scores. There should be some pagination and filtering and sorting of the entries by tags, category, and actionability.

## Other considerations

- Use only Javascript for this whole project.
- Minimize the amount of code and robustness for this - it's just a POC
- Keep it simple and readable.
- Provide a script to deploy the whole stack to DigitalOcean
