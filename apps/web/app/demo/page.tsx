import { sampleTitle } from "./format";
import { SamplePage } from "./sample-page";

export const metadata = { title: sampleTitle("/demo") };

export default function Page() {
  return <SamplePage path="/demo" />;
}
