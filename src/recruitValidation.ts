import { Client, ChannelType, TextChannel, Guild, ButtonBuilder, ButtonStyle, ActionRowBuilder, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, PermissionFlagsBits, Role } from 'discord.js';
import { query } from './database';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

export async function setupRecruitmentChannel(client: Client) {
  // Handle start recruitment button clicks
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith('start_recruitment_')) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    
    const applicationId = interaction.customId.replace('start_recruitment_', '');
    const userId = interaction.user.id;

    try {
      // Find the user's validated application
      const applicationResult = await query(
        'SELECT * FROM applications WHERE id = $1 AND recruit_id = $2 AND status = $3 LIMIT 1',
        [applicationId, userId, 'validated']
      );

      const application = applicationResult.rows[0];

      if (!application) {
        await interaction.editReply('Could not find your validated application. Please contact an administrator.');
        return;
      }

      const recruitHandle = application.handle;

      // Check if a recruitment channel already exists
      const existingChannel = interaction.guild?.channels.cache.find((ch: any) =>
        ch.name.includes(`recruit-${recruitHandle.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${application.id}`) && 
        ch.type === ChannelType.GuildText
      );

      if (existingChannel) {
        await interaction.editReply(`Your recruitment channel has already been created. Please check <#${existingChannel.id}>.`);
        return;
      }

      // Find or create a recruitment tickets category
      const category = interaction.guild?.channels.cache.find(c => 
        c.name === 'Recruitment Tickets' && c.type === ChannelType.GuildCategory
      );

      // Set up permission overwrites
      const permissionOverwrites = [
        {
          id: interaction.guild!.id,
          deny: [PermissionFlagsBits.ViewChannel], // Deny everyone access by default
        },
        {
          id: userId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        }
      ];

      // Find all roles with "recruiter" in their name and add them to permission overwrites
      const recruiterRoles = interaction.guild?.roles.cache.filter((role: Role) =>
        role.name.toLowerCase().includes('recruiter')
      );

      recruiterRoles?.forEach((role: Role) => {
        permissionOverwrites.push({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      });

      // Create the channel
      const recruitmentChannel = await interaction.guild!.channels.create({
        name: `recruit-${recruitHandle.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${application.id}`,
        type: ChannelType.GuildText,
        parent: category?.id, // Assign to category if found
        permissionOverwrites: permissionOverwrites,
      }) as TextChannel; // Explicitly cast to TextChannel
      
      if (!recruitmentChannel) {
        await interaction.editReply('Failed to create your recruitment channel. Please contact an administrator.');
        return;
      }

      // Update application status
      await query(
        `UPDATE applications SET status = $1, recruiter_id = NULL WHERE id = $2`,
        ['pending', application.id]
      );

      // Get the recruit's application data
      const recruitDataResult = await query(
        'SELECT * FROM applications WHERE id = $1 LIMIT 1',
        [application.id]
      );
      
      const recruitData = recruitDataResult.rows[0];
      
      // Create an embed for the recruit's information
      const { EmbedBuilder } = require('discord.js');
      
      const recruitEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Recruit Information: ${recruitData.handle}`)
        .setDescription('Star Citizen profile information')
        .addFields(
          { name: 'Handle', value: recruitData.handle || 'Not available', inline: true },
          { name: 'Real Name', value: recruitData.real_name || 'Not available', inline: true },
          { name: 'Title', value: recruitData.title || 'Not available', inline: true },
          { name: 'Enlisted Date', value: recruitData.enlisted_date || 'Not available', inline: true },
          { name: 'Location', value: recruitData.location || 'Not available', inline: true },
          { name: 'Fluency', value: recruitData.fluency || 'Not available', inline: true },
          { name: 'Organization', value: recruitData.org_name || 'Not available', inline: true },
          { name: 'SID', value: recruitData.org_sid || 'Not available', inline: true },
          { name: 'Rank', value: recruitData.org_rank || 'Not available', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Application ID: ${application.id}` });
      
      // Add thumbnail and image if available
      if (recruitData.profile_image_url) {
        recruitEmbed.setThumbnail(recruitData.profile_image_url);
      }
      
      if (recruitData.org_logo_url) {
        recruitEmbed.setImage(recruitData.org_logo_url);
      }
      
      // Send welcome message and recruit information
      await recruitmentChannel.send({
        content: `Welcome <@${userId}>! This is your private recruitment channel.\n\n` +
                 `A recruiter will review your information and guide you through the next steps.\n\n` +
                 `Please be patient and feel free to ask any questions here.`,
        embeds: [recruitEmbed]
      });

      // Notify recruiters in their channel
      const recruiterChannel = interaction.guild?.channels.cache.find((ch) =>
        ch.name.toLowerCase().includes('recruiter') && ch.type === ChannelType.GuildText
      ) as TextChannel;

      if (recruiterChannel) {
        let recruiterMentions = '';
        recruiterRoles?.forEach((role: Role) => {
          recruiterMentions += `${role.toString()} `;
        });

        await recruiterChannel.send({
          content: `${recruiterMentions}\nNew recruit application started: <#${recruitmentChannel.id}>`
        });
      }

      await interaction.editReply(`Your recruitment channel has been created! Please check <#${recruitmentChannel.id}>.`);

    } catch (error) {
      console.error('Error handling start recruitment button:', error);
      await interaction.editReply('An error occurred while starting the recruitment process. Please try again later.');
    }
  });

  client.on('guildCreate', async (guild) => {
    await setupChannelForGuild(guild);
  });

  // Also set up the channel for existing guilds when the bot starts
  for (const guild of client.guilds.cache.values()) {
    await setupChannelForGuild(guild);
  }

  // Handle button interactions for opening the handle input modal
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'open_handle_modal') {
      return;
    }

    // Create the modal for handle input
    const modal = new ModalBuilder()
      .setCustomId('handle_input_modal')
      .setTitle('Enter Your Star Citizen Handle');

    // Create the text input component
    const handleInput = new TextInputBuilder()
      .setCustomId('handle_input')
      .setLabel('Your Star Citizen Handle')
      .setPlaceholder('Enter your handle here')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(50);

    // Add the text input to an action row
    const actionRow = new ActionRowBuilder<TextInputBuilder>()
      .addComponents(handleInput);

    // Add the action row to the modal
    modal.addComponents(actionRow);

    // Show the modal to the user
    await interaction.showModal(modal);
  });

  // Handle modal submissions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit() || interaction.customId !== 'handle_input_modal') {
      return;
    }

    // Get the handle from the modal
    const recruitHandle = interaction.fields.getTextInputValue('handle_input').trim();
    const validationCode = `HMB-${uuidv4().slice(0, 8).toUpperCase()}`; // Generate a short code

    try {
      // Store initial application info and validation code
      const result = await query(
        'INSERT INTO applications(recruit_id, status, validation_code, handle) VALUES($1, $2, $3, $4) RETURNING id',
        [interaction.user.id, 'validation_pending', validationCode, recruitHandle]
      );
      const applicationId = result.rows[0].id;

      const validateButton = new ButtonBuilder()
        .setCustomId(`validate_recruit_${applicationId}`)
        .setLabel('Validate Bio')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(validateButton);

      await interaction.reply({
        content: `Thank you, ${interaction.user.username}! Please add the following code to your Star Citizen bio for validation: \`${validationCode}\`. Once added, click the button below to validate.`,
        ephemeral: true,
        components: [row],
      });

    } catch (error) {
      console.error('Error storing initial application:', error);
      await interaction.reply({ content: 'There was an error processing your request.', ephemeral: true });
    }
  });
}

// Helper function to set up the recruitment channel for a guild
async function setupChannelForGuild(guild: Guild) {
  const channelName = 'recruitment-info';
  const existingChannel = guild.channels.cache.find(ch => ch.name === channelName && ch.type === ChannelType.GuildText);

  if (existingChannel) {
    // Clear existing messages in the channel
    try {
      const channel = existingChannel as TextChannel;
      const messages = await channel.messages.fetch({ limit: 100 });
      await channel.bulkDelete(messages);
      
      // Add the new welcome message with button
      await sendWelcomeMessage(channel);
    } catch (error) {
      console.error('Error clearing messages in recruitment channel:', error);
    }
  } else {
    // Create a new channel
    try {
      const recruitmentChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
        ],
      });

      await sendWelcomeMessage(recruitmentChannel as TextChannel);
    } catch (error) {
      console.error('Error creating recruitment info channel:', error);
    }
  }
}

// Helper function to send the welcome message with button
async function sendWelcomeMessage(channel: TextChannel) {
  const handleButton = new ButtonBuilder()
    .setCustomId('open_handle_modal')
    .setLabel('Enter Star Citizen Handle')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(handleButton);

  await channel.send({
    content: 'Welcome to the recruitment process! Click the button below to begin your application.',
    components: [row],
  });
}

export async function handleRecruitValidationButton(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('validate_recruit_')) {
    return;
  }

  await interaction.deferReply({ ephemeral: true }); // Defer the reply as scraping can take time

  const applicationId = interaction.customId.replace('validate_recruit_', '');
  const userId = interaction.user.id;

  try {
    // Find the user's pending application by application ID and user ID
    const applicationResult = await query(
      'SELECT * FROM applications WHERE id = $1 AND recruit_id = $2 AND status = $3 LIMIT 1',
      [applicationId, userId, 'validation_pending']
    );

    const application = applicationResult.rows[0];

    if (!application) {
      await interaction.editReply('Could not find a pending validation for your account or this validation has expired.');
      return;
    }

    const recruitHandle = application.handle;
    const validationCode = application.validation_code;

    const url = `https://robertsspaceindustries.com/en/citizens/${recruitHandle}`;

    try {
      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const bio = $('.bio .value').text();

      if (bio.includes(validationCode)) {
        // Validation successful, scrape data
        // Personal info
        const citizenInfo = $('.info');
        const realName = citizenInfo.find('p.entry strong.value').first().text().trim();
        const handleName = citizenInfo.find('p.entry:contains("Handle name") strong.value').text().trim() || 
                          citizenInfo.find('p.entry strong.value').eq(1).text().trim(); // Fallback
        const title = citizenInfo.find('p.entry span.value').text().trim();

        // Organization info
        const mainOrgDiv = $('.main-org .info');
        const orgName = mainOrgDiv.find('p.entry a.value').text().trim();
        const orgSID = mainOrgDiv.find('p.entry:contains("SID") strong.value').text().trim() || 
                       mainOrgDiv.find('p.entry strong.value').first().text().trim(); // Fallback
        const orgRank = mainOrgDiv.find('p.entry:contains("rank") strong.value').text().trim() || 
                        mainOrgDiv.find('p.entry strong.value').eq(1).text().trim(); // Fallback

        // Additional info
        const leftCol = $('.left-col .inner');
        const enlistedDate = leftCol.find('p.entry:contains("Enlisted") strong.value').text().trim() || 
                             leftCol.find('p.entry strong.value').first().text().trim(); // Fallback
        const location = leftCol.find('p.entry:contains("Location") strong.value').text().trim() || 
                         leftCol.find('p.entry strong.value').eq(1).text().trim(); // Fallback
        const fluency = leftCol.find('p.entry:contains("Fluency") strong.value').text().trim() || 
                        leftCol.find('p.entry strong.value').eq(2).text().trim(); // Fallback

        // Get full URLs for images
        let profileImageUrl = $('.profile .thumb img').attr('src') || $('.thumb img').first().attr('src');
        let orgLogoUrl = $('.main-org .thumb img').attr('src');
        
        // Ensure URLs are absolute
        if (profileImageUrl && !profileImageUrl.startsWith('http')) {
          profileImageUrl = `https://robertsspaceindustries.com${profileImageUrl}`;
        }
        
        if (orgLogoUrl && !orgLogoUrl.startsWith('http')) {
          orgLogoUrl = `https://robertsspaceindustries.com${orgLogoUrl}`;
        }
        
        console.log('Scraped data:', {
          realName, handleName, title, orgName, orgSID, orgRank, enlistedDate, location, fluency, profileImageUrl, orgLogoUrl
        });

        // Update application status and store scraped data
        await query(
          `UPDATE applications SET 
            status = $1, 
            real_name = $2, 
            title = $3, 
            org_name = $4, 
            org_sid = $5, 
            org_rank = $6, 
            enlisted_date = $7, 
            location = $8, 
            fluency = $9, 
            profile_image_url = $10, 
            org_logo_url = $11 
          WHERE id = $12`,
          ['validated', realName, title, orgName, orgSID, orgRank, enlistedDate, location, fluency, profileImageUrl, orgLogoUrl, application.id]
        );

        // Create a button to start the recruitment process
        const startRecruitmentButton = new ButtonBuilder()
          .setCustomId(`start_recruitment_${application.id}`)
          .setLabel('Start Recruitment Process')
          .setStyle(ButtonStyle.Success);

        const recruitmentRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(startRecruitmentButton);

        await interaction.editReply({
          content: 'Validation successful! Your Star Citizen profile information has been saved.\n\n' +
                  '**What happens next?**\n' +
                  '1. Click the button below to start the recruitment process\n' +
                  '2. A private channel will be created for you\n' +
                  '3. A recruiter will review your information and contact you\n' +
                  '4. You will be guided through the onboarding process\n\n' +
                  'When you are ready, click the button below:',
          components: [recruitmentRow]
        });

        // Find the recruit's ticket channel and send the information
        const recruitTicketChannel = interaction.guild?.channels.cache.find((ch: any) =>
          ch.name.includes(`recruit-${recruitHandle.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${application.id}`) && ch.type === ChannelType.GuildText
        ) as TextChannel;

        if (recruitTicketChannel) {
          let recruiterMentions = '';
          const recruiterRoles = interaction.guild?.roles.cache.filter((role: any) =>
            role.name.toLowerCase().includes('recruiter')
          );
          recruiterRoles?.forEach((role: any) => {
            recruiterMentions += `${role.toString()} `;
          });


          await recruitTicketChannel.send({
            content: `${recruiterMentions}\n**Recruit Information:**\n` +
                     `Handle: ${handleName}\n` +
                     `Real Name: ${realName}\n` +
                     `Title: ${title}\n` +
                     `Enlisted: ${enlistedDate}\n` +
                     `Location: ${location}\n` +
                     `Fluency: ${fluency}\n\n` +
                     `**Main Organization:**\n` +
                     `Name: ${orgName}\n` +
                     `SID: ${orgSID}\n` +
                     `Rank: ${orgRank}\n\n` +
                     `Bio:\n${bio}\n\n` +
                     `Profile Image: ${profileImageUrl}\n` +
                     `Org Logo: ${orgLogoUrl}`
          });
        }

        // Grant UEE-Validated role
        const ueeValidatedRole = interaction.guild?.roles.cache.find((role: any) => role.name === 'UEE-Validated');
        const member = interaction.guild?.members.cache.get(userId);

        if (member) {
          if (ueeValidatedRole) {
            await member.roles.add(ueeValidatedRole);
          } else {
            // Create the role if it doesn't exist
            const newRole = await interaction.guild?.roles.create({
              name: 'UEE-Validated',
              reason: 'Role for validated Star Citizen recruits',
            });
            if (newRole) {
              await member.roles.add(newRole);
            }
          }
        }


      } else {
        await query(
          `UPDATE applications SET status = $1 WHERE id = $2`,
          ['validation_failed', application.id]
        );
        await interaction.editReply('Validation failed. The code was not found in your Star Citizen bio. Please try again.');
      }

    } catch (error) {
      console.error('Error scraping RSI website:', error);
      await query(
        `UPDATE applications SET status = $1 WHERE id = $2`,
        ['validation_failed', application.id]
      );
      await interaction.editReply('There was an error validating your handle. Please ensure your handle is correct and your profile is public.');
    }

  } catch (error) {
    console.error('Error handling validation button click:', error);
    await interaction.editReply('An internal error occurred during validation.');
  }
}