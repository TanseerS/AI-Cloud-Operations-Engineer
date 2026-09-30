export function Button({
  variant = 'default',
  iconOnly = false,
  className = '',
  children,
  ...rest
}) {
  const variantClass = variant === 'default' ? '' : ` button--${variant}`;
  const shapeClass = iconOnly ? ' button--icon' : '';
  return (
    <button type="button" className={`button${variantClass}${shapeClass}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  );
}

export default Button;
