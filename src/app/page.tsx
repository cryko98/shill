import { publicRules } from "@/lib/config";
import App from "@/components/App";

export const dynamic = "force-dynamic";

export default function Page() {
  return <App rules={publicRules()} />;
}
