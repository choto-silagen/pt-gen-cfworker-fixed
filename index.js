import {handleFetch} from "./app";

export default {
  fetch(request, env, ctx) {
    return handleFetch(request, ctx, env);
  }
};
