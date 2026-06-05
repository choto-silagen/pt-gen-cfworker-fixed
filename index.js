import {handleFetch} from "./app";

addEventListener("fetch", event => {
  event.respondWith(handleFetch(event.request, event));
});
