import {
  ApolloClient, ApolloLink, split, HttpLink,
} from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';
import { InMemoryCache } from '@apollo/client/cache';
import { SET_CACHE } from 'services/queries';
import { getOrgSlug } from 'services/location';
import { resolvers, defaults } from './localState';
// import introspectionQueryResultData from './fragmentTypes.json';

// removed from apollo
// todo: replace?
/* const fragmentMatcher = new IntrospectionFragmentMatcher({
  introspectionQueryResultData,
}); */

export default function apolloClient(token) {
  const cache = new InMemoryCache({
    dataIdFromObject: (object) => `${object.__typename}:${object.nodeId}`,
    // fragmentMatcher,
  });

  const authMiddleware = new ApolloLink((operation, forward) => {
    const authObj = token ? {
      Authorization: `Bearer ${token}`,
    } : {};

    operation.setContext({
      headers: {
        orgSlug: getOrgSlug(),
        ...authObj,
      },
    });
    return forward(operation);
  });

  const httpLink = new HttpLink({
    uri: process.env.REACT_APP_GRAPHQL_ENDPOINT,
  });

  const wsLink = new WebSocketLink({
    uri: process.env.REACT_APP_GRAPHQL_SUBSCRIPTION,
    options: {
      reconnect: true,
      connectionParams: {
        Authorization: `Bearer ${token}`,
        orgSlug: getOrgSlug(),
      },
    },
  });

  // using the ability to split links, you can send data to each link
  // depending on what kind of operation is being sent
  const terminatingLink = split(
    // split based on operation type
    ({ query }) => {
      const { kind, operation } = getMainDefinition(query);
      return kind === 'OperationDefinition' && operation === 'subscription';
    },
    wsLink,
    httpLink,
  );

  const client = new ApolloClient({
    cache,
    resolvers,
    link: ApolloLink.from([authMiddleware, terminatingLink]),
  });

  const initStore = () => {
    cache.writeQuery({
      query: SET_CACHE,
      data: defaults,
    });
  };

  initStore();

  client.onResetStore(initStore);

  return client;
}
