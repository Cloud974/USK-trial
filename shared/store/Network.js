import { observable, ObservableMap } from 'mobx';
import { autobind } from 'core-decorators';
import serverWait from 'utils/mobx-server-wait';
import fetch from 'isomorphic-fetch';
import pRetry from 'p-retry';

/**
 * This store handles network requests.
 */
export default class Network {

  /**
   * Keep a history map of network requests for
   * throttling them.
   * @var {Map} The key is url.
   */
  @observable
  static history = new ObservableMap();

  // Symlink static method to private method
  fetch = Network.fetch;

  /**
   * Extended fetch method with credentials needed
   * to make http requests to the API.
   * @param {string} Url
   * @param {object} Options
   * @return {Promise}
   */
  @autobind
  @serverWait
  static fetch(url, { maxAge = Infinity, retries = 1, force = false } = {}) {

    const { history } = Network;

    if (!history.has(url)) {
      history.set(url, {});
    }

    // Get reference point to history item
    const item = history.get(url);

    // Return already running promise if available.
    // Unless force flag is in options.
    if (!force && item.promise && item.promise.then) {
      return item.promise;
    }

    // Return cache if still valid
    if (item.data) {
      const now = new Date().getTime();
      if ((now / 1000) - (item.ts / 1000) <= maxAge) {
        return Promise.resolve(item.data);
      }
    }

    // Create a promisified callback function to be ran by p-retry.
    const run = () => fetch(url)
      .then((res) => {
        // Catch 404 errors to stop retrying
        if (res.status === 404) {
          throw new pRetry.AbortError('404 Not found');
        }
        return res.json();
      })
      .then(((data) => {
        // Set timestamp and data to history cache
        item.ts = new Date().getTime();
        item.data = data;
        return data;
      }));

    // Create a promise of p-retry running the fetch
    const promise = pRetry(run, { retries })
      .then((data) => {
        // Delete promise so we know we're not running anyting for this url anymore.
        delete item.promise;
        return data;
      })
      .catch((err) => {
        // Delete promise so we know we're not running anyting for this url anymore.
        delete item.promise;
        throw err;
      });

    // Attach promise to history item for further use
    item.promise = promise;

    return promise;
  }
}
