import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { MandatoryUpdateGate } from "./src/components/MandatoryUpdateGate";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { Sentry } from "./src/lib/sentry";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2
    }
  }
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
      <MandatoryUpdateGate />
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(App);
