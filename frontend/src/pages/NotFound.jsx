import { Link } from "react-router-dom";
import { Button, Card } from "../components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-md p-10 text-center">
      <p className="text-4xl font-bold text-slate-300">404</p>
      <p className="mt-2 text-slate-600">This page doesn&apos;t exist.</p>
      <Link to="/"><Button className="mt-6">Back to start</Button></Link>
    </Card>
  );
}
