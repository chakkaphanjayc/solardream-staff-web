type SummaryMessageInput = {
  solarKwp: number;
  totalPrice: number;
  monthlySavings: number;
  estimatedInstallment: number;
  roofing: string;
};

const currency = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return currency.format(Math.max(0, Math.round(value)));
}

export function buildSolarSummaryFlexMessage(input: SummaryMessageInput) {
  const headline = `${input.solarKwp.toFixed(2)} kWp`;
  const altText = `SolarDream summary ${headline} • ${formatCurrency(input.totalPrice)}`;

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        paddingAll: "18px",
        contents: [
          {
            type: "text",
            text: "SolarDream Summary",
            color: "#B7D1EA",
            size: "sm",
            weight: "bold",
          },
          {
            type: "text",
            text: headline,
            color: "#FFFFFF",
            size: "xl",
            weight: "bold",
            margin: "sm",
          },
          {
            type: "text",
            text: input.roofing,
            color: "#CBD5E1",
            size: "xs",
            wrap: true,
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "Budget", size: "xs", color: "#64748B", flex: 4 },
              { type: "text", text: formatCurrency(input.totalPrice), size: "xs", weight: "bold", color: "#0F172A", flex: 5, align: "end" },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "Monthly Savings", size: "xs", color: "#64748B", flex: 4 },
              { type: "text", text: formatCurrency(input.monthlySavings), size: "xs", weight: "bold", color: "#047857", flex: 5, align: "end" },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "Installment", size: "xs", color: "#64748B", flex: 4 },
              { type: "text", text: formatCurrency(input.estimatedInstallment), size: "xs", weight: "bold", color: "#0F172A", flex: 5, align: "end" },
            ],
          },
        ],
      },
    },
  };
}
