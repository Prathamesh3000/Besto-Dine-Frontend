// Red asterisk for required form labels (QA N2). Hidden from screen
// readers — pair the field with aria-required / "required" instead.
const RequiredMark = ({ className = '' }) => (
  <span className={`text-red-500 ml-0.5 ${className}`} aria-hidden="true">*</span>
);

export default RequiredMark;
