import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ModuleCardProps = {
  title: string;
  description: string;
};

export function ModuleCard({ description, title }: ModuleCardProps) {
  return (
    <Card className="bg-white transition duration-200 hover:-translate-y-0.5 hover:shadow-soft">
      <CardHeader>
        <Badge variant="outline">Ready to extend</Badge>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-6 text-slate-600">
        {description}
      </CardContent>
    </Card>
  );
}
