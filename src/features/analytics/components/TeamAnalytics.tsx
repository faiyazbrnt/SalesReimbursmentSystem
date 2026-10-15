import { Claim, ExpenseLineItem, User } from '../../../types';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxisMoney, formatMoney } from '../../../lib/money';
import { calculateTeamAnalytics } from '../../../lib/teamAnalytics';
import { Card } from '../../../components/ui/Card';
import { CHART_ANIMATION_PROPS, CHART_AXIS_PROPS, CHART_COLORS, CHART_GRID_PROPS } from '../../../lib/chartTheme';
import { EmptyChartState, ChartLegend, ChartTooltip, formatCompactChartValue } from './ChartPrimitives';

export interface TeamAnalyticsProps {
  members: User[];
  claims: Claim[];
  lineItems: ExpenseLineItem[];
  title?: string;
  description?: string;
  showSpendCharts?: boolean;
}

export interface TeamMemberSpendingProps {
  members: User[];
  claims: Claim[];
  lineItems: ExpenseLineItem[];
}

export function TeamMemberSpending({ members, claims, lineItems }: TeamMemberSpendingProps) {
  const analytics = calculateTeamAnalytics({ members, claims, lineItems });
  const maxMemberSpend = Math.max(...analytics.members.map(member => member.receiptSpend), 1);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h4 className="font-headline-md text-on-surface">Team Member Spending</h4>
          <p className="text-xs text-outline mt-1">Receipt-supported spend by direct report.</p>
        </div>
        <span className="text-xs text-outline">{analytics.receiptCount} receipts</span>
      </div>
      {analytics.members.length === 0 ? (
        <div className="py-10 text-center text-outline text-body-sm">No direct-report expenses are available.</div>
      ) : (
        <div className="space-y-3">
          {analytics.members.map(member => (
            <div key={member.id} className="rounded-lg border border-outline-variant p-3 bg-surface-container-lowest">
              <div className="flex items-center gap-3">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-xs">
                    {member.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-label-md text-on-surface truncate">{member.name}</p>
                      <p className="text-[11px] text-outline">{member.claimCount} requests · {member.pendingCount} open · {member.receiptCount} receipts</p>
                    </div>
                    <p className="font-mono-data font-bold text-on-surface">{formatMoney(member.receiptSpend)}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-container-high mt-2 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (member.receiptSpend / maxMemberSpend) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function TeamAnalytics({
  members,
  claims,
  lineItems,
  title = 'Team Analytics',
  description = 'Direct-report activity and receipt-supported spend.',
  showSpendCharts = true,
}: TeamAnalyticsProps) {
  const analytics = calculateTeamAnalytics({ members, claims, lineItems });
  const maxMemberSpend = Math.max(...analytics.members.map(member => member.receiptSpend), 1);
  const maxCategorySpend = Math.max(...analytics.categories.map(category => category.amount), 1);

  if (members.length === 0) {
    return (
      <Card className="p-8 text-center">
        <span className="material-symbols-outlined text-4xl text-outline mb-2">group_off</span>
        <p className="font-headline-sm text-on-surface">No direct reports found</p>
        <p className="text-body-sm text-outline mt-1">Team analytics will appear when people report to this approver.</p>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label={title}>
      <Card className="flex items-center gap-3 p-5">
        <span aria-hidden="true" className="material-symbols-outlined rounded-lg bg-primary/5 p-2 text-primary">groups</span>
        <div className="min-w-0">
          <h3 className="font-headline-md text-on-surface">{title}</h3>
          <p className="text-xs text-outline mt-1">{description}</p>
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] gap-4 items-stretch">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
          {showSpendCharts && (<Card className="min-w-0 p-5 flex flex-col">
            <div className="mb-4">
              <h4 className="font-label-lg text-on-surface">Category distribution</h4>
              <p className="text-xs text-outline mt-1">Top receipt-backed categories, ranked by value</p>
            </div>
            {analytics.categories.length === 0 ? (
              <div className="h-56"><EmptyChartState description="No team receipts are available for this view." /></div>
            ) : (
              <div className="h-56" role="img" aria-label="Receipt-supported team spending across the top six categories.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.categories.slice(0, 6)} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} accessibilityLayer>
                    <CartesianGrid {...CHART_GRID_PROPS} horizontal={false} />
                    <XAxis type="number" {...CHART_AXIS_PROPS} fontSize={11} tickFormatter={formatAxisMoney} />
                    <YAxis type="category" dataKey="name" {...CHART_AXIS_PROPS} fontSize={10} interval={0} width={96} />
                    <Tooltip content={<ChartTooltip labels={{ amount: 'Supported spend' }} valueTypes={{ amount: 'currency' }} />} />
                    <Bar dataKey="amount" name="Supported spend" fill={CHART_COLORS.tertiary} radius={[0, 5, 5, 0]} barSize={20} {...CHART_ANIMATION_PROPS}>
                      <LabelList dataKey="amount" position="right" formatter={value => formatCompactChartValue(value, 'currency')} className="fill-on-surface font-mono-data text-[10px]" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          <div className="mt-auto flex items-center justify-between border-t border-outline-variant/30 pt-3 text-[11px] text-outline"><span>{analytics.categories.length} active categories</span><span>All reports</span></div>
          </Card>)}
          <Card className="min-w-0 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-label-lg text-on-surface">Supported spend by category</h4>
            <span className="font-mono-data text-xs text-primary">{formatMoney(analytics.receiptSpend)}</span>
          </div>
          {analytics.categories.length === 0 ? (
            <div className="flex flex-1 min-h-56 flex-col items-center justify-center text-center text-outline text-body-sm"><span aria-hidden="true" className="material-symbols-outlined mb-3 text-3xl text-outline/50">description</span>No team receipts are available.</div>
          ) : (
            <div className="space-y-4">
              {analytics.categories.slice(0, 6).map(category => (
                <div key={category.name}>
                  <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                    <span className="font-medium text-on-surface truncate">{category.name}</span>
                    <span className="font-mono-data text-on-surface-variant whitespace-nowrap">{formatMoney(category.amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div
                      className="h-full rounded-full bg-tertiary"
                      style={{ width: `${Math.max(3, (category.amount / maxCategorySpend) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-outline mt-1">{category.receiptCount} receipt{category.receiptCount === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
          {showSpendCharts && (<Card className="min-w-0 p-5 md:col-span-2">
            <div className="mb-4">
              <h4 className="font-label-lg text-on-surface">Team spend and payouts</h4>
              <p className="text-xs text-outline mt-1">Receipt-supported spend compared with actual company reimbursements</p>
            </div>
            <div className="h-64" role="img" aria-label="Receipt-supported team spend compared with amounts paid for up to eight team members.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.members.slice(0, 8)} layout="vertical" margin={{ left: 8, right: analytics.members.length <= 4 ? 68 : 12 }} accessibilityLayer>
                  <CartesianGrid {...CHART_GRID_PROPS} horizontal={false} />
                  <XAxis type="number" {...CHART_AXIS_PROPS} fontSize={11} tickFormatter={formatAxisMoney} />
                  <YAxis type="category" dataKey="name" {...CHART_AXIS_PROPS} fontSize={11} width={112} />
                  <Tooltip content={<ChartTooltip labels={{ receiptSpend: 'Supported spend', paidAmount: 'Paid' }} valueTypes={{ receiptSpend: 'currency', paidAmount: 'currency' }} />} />
                  <Legend verticalAlign="bottom" content={<ChartLegend />} />
                  <Bar dataKey="receiptSpend" name="Supported spend" fill={CHART_COLORS.primary} radius={[0, 5, 5, 0]} barSize={13} {...CHART_ANIMATION_PROPS}>
                    {analytics.members.length <= 4 && <LabelList dataKey="receiptSpend" position="right" formatter={value => formatCompactChartValue(value, 'currency')} className="fill-on-surface font-mono-data text-[10px]" />}
                  </Bar>
                  <Bar dataKey="paidAmount" name="Paid" fill={CHART_COLORS.success} radius={[0, 5, 5, 0]} barSize={13} {...CHART_ANIMATION_PROPS}>
                    {analytics.members.length <= 4 && <LabelList dataKey="paidAmount" position="right" formatter={value => formatCompactChartValue(value, 'currency')} className="fill-on-surface font-mono-data text-[10px]" />}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>)}
        </div>
        <aside className="flex min-w-0 flex-col gap-3" aria-label="Team overview">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2"><p className="text-[10px] uppercase tracking-wider text-outline">Team members</p><span aria-hidden="true" className="material-symbols-outlined text-[18px] text-outline">person</span></div>
              <p className="font-headline-sm mt-3">{members.length}<span className="ml-1 text-[11px] font-normal text-outline">active</span></p>
            </Card>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2"><p className="text-[10px] uppercase tracking-wider text-outline">Open requests</p><span aria-hidden="true" className="material-symbols-outlined text-[18px] text-tertiary">schedule</span></div>
              <p className="font-headline-sm mt-3">{analytics.pendingClaims}<span className="ml-1 text-[11px] font-normal text-outline">pending</span></p>
            </Card>
          </div>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary">Reimbursed 7d</p>
            <p className="font-mono-data text-2xl font-bold text-primary mt-4">{formatMoney(analytics.reimbursedThisWeek)}</p>
            <p className="mt-3 border-t border-outline-variant/30 pt-3 text-xs text-outline">Settled company payouts</p>
          </Card>
          <Card className="min-w-0 flex-1 p-4 flex flex-col">
          <div className="flex flex-col gap-1 mb-4">
            <h4 className="font-label-md text-on-surface">Team member comparison</h4>
            <span className="text-xs text-outline">{analytics.receiptCount} supported receipts</span>
          </div>
          <div className="space-y-3">
            {analytics.members.map(member => (
              <div key={member.id} className="rounded-lg border border-outline-variant p-3 bg-surface-container-low/30">
                <div className="flex items-center gap-3">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold text-xs">
                      {member.name.split(' ').map(part => part[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-label-md text-on-surface truncate">{member.name}</p>
                        <p className="text-[11px] text-outline">{member.claimCount} requests · {member.pendingCount} open · {member.receiptCount} receipts</p>
                      </div>
                      <p className="font-mono-data font-bold text-on-surface">{formatMoney(member.receiptSpend)}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-container-high mt-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(3, (member.receiptSpend / maxMemberSpend) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        <p className="mt-auto border-t border-outline-variant/30 pt-3 text-[11px] text-outline">Showing {analytics.members.length} of {members.length} members</p>
        </Card>
        </aside>
      </div>
    </section>
  );
}
