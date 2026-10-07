'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { SubscriptionPlan } from '@/lib/api';

export type PlanDistributionItem = {
  plan: SubscriptionPlan;
  count: number;
};

const planNames: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const planColors: Record<SubscriptionPlan, string> = {
  STARTER: '#A8ADB5',
  PRO: '#515862',
  BUSINESS: '#F35A24',
};

const numberFormat = new Intl.NumberFormat('fr-FR');

export function PlatformPlanDistributionChart({
  data,
}: {
  data: PlanDistributionItem[];
}) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div className="grid min-h-52 place-items-center rounded-lg bg-[#F7F8F9] px-5 text-center">
        <div>
          <p className="text-sm font-semibold text-[#30343A]">
            Aucune répartition disponible
          </p>
          <p className="mt-1 text-xs text-[#707680]">
            Les organisations et leurs plans apparaîtront ici.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: planNames[item.plan],
    value: item.count,
    plan: item.plan,
  }));

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.75fr)]">
      <div
        aria-label="Répartition des organisations par plan"
        className="relative h-[230px] min-w-0"
        role="group"
      >
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer>
            <Pie
              data={chartData}
              dataKey="value"
              innerRadius="62%"
              isAnimationActive={false}
              nameKey="name"
              outerRadius="84%"
              paddingAngle={2}
              stroke="#FFFFFF"
              strokeWidth={3}
            >
              {chartData.map((entry) => (
                <Cell fill={planColors[entry.plan]} key={entry.plan} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => numberFormat.format(Number(value))}
              itemStyle={{ color: '#30343A', fontSize: 13 }}
              labelStyle={{ color: '#626973', fontSize: 12, fontWeight: 500 }}
              contentStyle={{
                border: '1px solid #E2E5E9',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(23,25,29,0.08)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-[#25282D]">
            {numberFormat.format(total)}
          </span>
          <span className="text-[11px] text-[#7A8089]">organisations</span>
        </div>
      </div>
      <ul aria-label="Nombre d’organisations par plan" className="space-y-4">
        {chartData.map((item) => (
          <li className="flex items-center justify-between gap-3" key={item.plan}>
            <span className="flex min-w-0 items-center gap-2 text-[15px] text-[#515761]">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: planColors[item.plan] }}
              />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="tabular-nums text-[15px] font-semibold text-[#25282D]">
              {numberFormat.format(item.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
