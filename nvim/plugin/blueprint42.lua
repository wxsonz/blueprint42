-- blueprint42 commands (the plugin itself is lua/blueprint42.lua).
if vim.g.loaded_blueprint42 then return end
vim.g.loaded_blueprint42 = true

local function cmds(prefix, note)
  vim.api.nvim_create_user_command(prefix .. 'Connect', function(a) require('blueprint42').connect(a.args) end,
    { nargs = '?', desc = 'blueprint42: show these buffers live (arg: port or URL)' .. note })
  vim.api.nvim_create_user_command(prefix .. 'Disconnect', function() require('blueprint42').disconnect() end,
    { desc = 'blueprint42: stop' .. note })
  vim.api.nvim_create_user_command(prefix .. 'Open', function(a) require('blueprint42').open(a.args) end,
    { nargs = '?', complete = 'dir', desc = 'blueprint42: open this project in the page' .. note })
end
cmds('B42', '')
-- the names from before the rename, still answering
cmds('Ftb', ' (old name of :B42…)')
