type JsonLdValue = boolean | number | string | null | JsonLdObject | JsonLdValue[];

export type JsonLdObject = {
  [key: string]: JsonLdValue;
};

export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
