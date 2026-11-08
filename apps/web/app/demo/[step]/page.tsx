import { notFound } from "next/navigation";
import { sampleTitle } from "../format";
import { SAMPLE_ROUTES, sampleRoute } from "../sample-data";
import { SamplePage } from "../sample-page";

export const dynamicParams = false;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const route = sampleRoute(`/demo/${step}`);
  if (!route || route.path === "/demo") notFound();
  return { title: sampleTitle(route.path) };
}
export function generateStaticParams() {
  return SAMPLE_ROUTES.filter((route) => route.path !== "/demo").map(
    (route) => ({ step: route.path.slice(6) }),
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const route = sampleRoute(`/demo/${step}`);
  if (!route || route.path === "/demo") notFound();
  return <SamplePage path={route.path} />;
}
