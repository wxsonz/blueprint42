-- ft_blueprint commands (the plugin itself is lua/ft_blueprint.lua).
if vim.g.loaded_ft_blueprint then return end
vim.g.loaded_ft_blueprint = true

vim.api.nvim_create_user_command('FtbConnect', function(a) require('ft_blueprint').connect(a.args) end,
  { nargs = '?', desc = 'ft_blueprint: show these buffers live (arg: port or URL)' })
vim.api.nvim_create_user_command('FtbDisconnect', function() require('ft_blueprint').disconnect() end,
  { desc = 'ft_blueprint: stop' })
vim.api.nvim_create_user_command('FtbOpen', function(a) require('ft_blueprint').open(a.args) end,
  { nargs = '?', complete = 'dir', desc = 'ft_blueprint: open this project in the page' })
