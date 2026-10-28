// Kiểm tra dữ liệu form bằng zod, trả về kết quả dễ dùng trong service/controller.
//   const result = validate(taskSchema, req.body);
//   if (!result.ok) -> result.errors = { title: 'Bắt buộc nhập', ... }
//   else            -> result.data đã được làm sạch/ép kiểu

export function validate(schema, input) {
  const parsed = schema.safeParse(input ?? {});
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} };

  const errors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.join('.') || '_form';
    errors[field] ??= issue.message; // giữ lỗi đầu tiên của mỗi field
  }
  return { ok: false, data: null, errors };
}

/** Form HTML gửi chuỗi rỗng cho ô trống; đổi thành undefined để zod hiểu là "không nhập". */
export const emptyToUndefined = (value) => (value === '' ? undefined : value);
